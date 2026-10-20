import type { MapshotWorkerEnv } from "../cloudflare.config.ts";
import { connectWorkerToContainer } from "@cataqui/workerhole";
import { raceWithSignal } from "@cataqui/async";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { MapshotWorkerContainerPortal } from "@cataqui/mapshot-workerhole";
import { ContainerConfig, type ContainerRenderOutput } from "@cataqui/mapshot-workerhole";
import { Container } from "@cloudflare/containers";
import { ContainerOperationTimedOutError } from "./errors/container-operation-timed-out.error";
import { ContainerReadinessFailedError } from "./errors/container-readiness-failed.error";
import { ContainerRuntimeFailedError } from "./errors/container-runtime-failed.error";
import { ContainerShutdownFailedError } from "./errors/container-shutdown-failed.error";
import { ContainerUnavailableError } from "./errors/container-unavailable.error";
import { MapshotWorkerError } from "./errors/mapshot-worker.error";
import { MapshotWorkerPortal } from "./worker-portal";

export class MapshotContainer extends Container<MapshotWorkerEnv> {
	private _containerPortal: MapshotWorkerContainerPortal | undefined;
	private _readiness: symbol | undefined;
	private _starting: Promise<void> | undefined;
	private _stopping: Promise<void> | undefined;
	private _recovery: { operation: Promise<void>; status: "pending" | "failed" } | undefined;
	private _completedRenderCount = 0;
	private _pendingRenders = 0;
	private readonly _lifecycleTimeoutMs = 20_000;
	override defaultPort = ContainerConfig.port;
	override enableInternet = false;
	override sleepAfter = (this.env.SLEEP_AFTER_MS ?? 60_000) / 1_000;

	private get _hasPendingRenders(): boolean {
		return this._pendingRenders > 0;
	}

	override onError(_error: unknown): never {
		throw new ContainerRuntimeFailedError();
	}

	override async onStop(): Promise<void> {
		const rpc = this._containerPortal;
		this._containerPortal = undefined;
		this._readiness = undefined;
		await rpc?.close();
	}

	override async onActivityExpired(): Promise<void> {
		const container = this.ctx.container;
		if (container === undefined || !container.running) return;
		const lifecycleOperationInProgress = this._stopping !== undefined || this._recovery !== undefined;
		if (lifecycleOperationInProgress || this._hasPendingRenders) return;

		if (this.env.SLEEP_AFTER_MS === undefined) {
			const readiness = this._readiness;
			const completedRenderCount = this._completedRenderCount;
			const abortController = new AbortController();
			const controlTimeoutMs = 2_000;
			const timer = setTimeout(() => abortController.abort(), controlTimeoutMs);
			try {
				await this.#_checkHealth({
					signal: abortController.signal,
					requestTimeoutMs: controlTimeoutMs,
				});
			} catch {
				const readinessUnchanged = this._readiness === readiness;
				const noRenderSucceededDuringCheck = this._completedRenderCount === completedRenderCount;
				const noPendingRenders = !this._hasPendingRenders;
				const containerStillRunning = container.running;
				if (readinessUnchanged && noRenderSucceededDuringCheck && noPendingRenders && containerStillRunning) {
					void this.#_destroyUnhealthyContainer();
				}
				console.warn("Static renderer idle health check unavailable.");
			} finally {
				clearTimeout(timer);
				abortController.abort();
			}

			return;
		}

		this._readiness = undefined;

		const stopping = Promise.resolve()
			.then(async () => {
				const closing = this._containerPortal?.close();
				this._containerPortal = undefined;
				await closing;
				const stopped = container.monitor();
				await Promise.all([this.stop(), stopped]);
			})
			.catch((error: unknown) => {
				if (error instanceof MapshotWorkerError) throw error;
				throw new ContainerShutdownFailedError();
			});

		this._stopping = stopping;
		try {
			await stopping;
		} finally {
			this._stopping = undefined;
		}
	}

	async render(input: MapshotRenderInput): Promise<ContainerRenderOutput> {
		this._pendingRenders += 1;
		let streamOwnershipTransferred = false;
		try {
			const stopping = this._stopping;
			if (stopping !== undefined)
				await raceWithSignal(() => stopping, {
					createAbortError: () => new ContainerOperationTimedOutError(),
					signal: AbortSignal.timeout(this._lifecycleTimeoutMs),
				});
			const recovery = this._recovery;
			if (recovery !== undefined) {
				await raceWithSignal(
					() => (recovery.status === "failed" ? this.#_destroyUnhealthyContainer() : recovery.operation),
					{
						createAbortError: () => new ContainerOperationTimedOutError(),
						signal: AbortSignal.timeout(this._lifecycleTimeoutMs),
					},
				);
			}
			const canReuseReadiness = this._readiness !== undefined && this.ctx.container?.running === true;
			if (!canReuseReadiness) {
				this._readiness = undefined;
				this._starting ??= (async (): Promise<void> => {
					const controller = new AbortController();
					const timer = setTimeout(() => controller.abort(), this._lifecycleTimeoutMs);
					const deadline = Date.now() + this._lifecycleTimeoutMs;
					let failedHealth = false;
					try {
						const container = this.ctx.container;
						if (container === undefined) throw new ContainerUnavailableError();
						this._containerPortal ??= connectWorkerToContainer(MapshotWorkerContainerPortal, {
							context: this.ctx,
							expose: MapshotWorkerPortal,
						});
						await raceWithSignal(
							() => this.start(undefined, { signal: controller.signal, portToCheck: ContainerConfig.port }),
							{ createAbortError: () => new ContainerOperationTimedOutError(), signal: controller.signal },
						);
						while (Date.now() < deadline && !controller.signal.aborted) {
							try {
								await this.#_checkHealth({
									signal: controller.signal,
									requestTimeoutMs: Math.min(2_000, deadline - Date.now()),
								});
								controller.signal.throwIfAborted();
								failedHealth = false;
							} catch {
								failedHealth = true;
								if (controller.signal.aborted) {
									throw new ContainerReadinessFailedError({ message: "Native Container readiness timed out" });
								}
								await raceWithSignal(() => scheduler.wait(100), {
									createAbortError: () => new ContainerOperationTimedOutError(),
									signal: controller.signal,
								});
								continue;
							}
							return;
						}
						throw new ContainerReadinessFailedError({ message: "Native Container readiness timed out" });
					} catch (error) {
						const containerStartedButNeverReady = failedHealth && this.ctx.container?.running === true;
						if (containerStartedButNeverReady)
							await raceWithSignal(() => this.#_destroyUnhealthyContainer(), {
								createAbortError: () => new ContainerOperationTimedOutError(),
								signal: AbortSignal.timeout(this._lifecycleTimeoutMs),
							});
						if (error instanceof MapshotWorkerError) throw error;
						throw new ContainerReadinessFailedError({ message: "Mapshot container startup failed." });
					} finally {
						clearTimeout(timer);
						controller.abort();
					}
				})()
					.then(() => {
						this._readiness = Symbol();
					})
					.finally(() => {
						this._starting = undefined;
					});
				await this._starting;
			}
			const result = await this._containerPortal!.render(input);
			const reader = result.bytes.getReader();
			let finished = false;
			const finish = (): void => {
				if (finished) return;
				finished = true;
				reader.releaseLock();
				this._pendingRenders -= 1;
				this.renewActivityTimeout();
			};
			const bytes = new ReadableStream({
				type: "bytes",
				async pull(controller): Promise<void> {
					try {
						const chunk = await reader.read();
						if (chunk.done) {
							controller.close();
							controller.byobRequest?.respond(0);
							finish();
						} else controller.enqueue(chunk.value);
					} catch (error) {
						controller.error(error);
						finish();
					}
				},
				async cancel(reason): Promise<void> {
					try {
						await reader.cancel(reason);
					} finally {
						finish();
					}
				},
			});
			streamOwnershipTransferred = true;
			this._completedRenderCount += 1;
			return { bytes: bytes, metadata: result.metadata };
		} finally {
			if (!streamOwnershipTransferred) {
				this._pendingRenders -= 1;
				this.renewActivityTimeout();
			}
		}
	}

	#_destroyUnhealthyContainer(): Promise<void> {
		if (this._recovery?.status === "pending") return this._recovery.operation;

		this._readiness = undefined;
		const operation = Promise.resolve().then(async (): Promise<void> => {
			const container = this.ctx.container;
			if (container === undefined) throw new ContainerUnavailableError();
			try {
				const closing = this._containerPortal?.close();
				this._containerPortal = undefined;
				const outcomes = await Promise.allSettled([closing, container.destroy()]);
				for (const outcome of outcomes) {
					if (outcome.status === "rejected") throw outcome.reason;
				}
			} catch (error) {
				if (error instanceof MapshotWorkerError) throw error;
				const failure = new ContainerShutdownFailedError();
				console.error({ errorCode: failure.errorCode, message: failure.message });
				throw failure;
			}
		});

		const recovery: { operation: Promise<void>; status: "pending" | "failed" } = {
			operation: operation,
			status: "pending",
		};

		this._recovery = recovery;
		this.ctx.waitUntil(
			operation.then(
				() => {
					this._recovery = undefined;
				},
				() => {
					recovery.status = "failed";
				},
			),
		);
		return operation;
	}

	async #_checkHealth(params: { signal: AbortSignal; requestTimeoutMs: number }): Promise<void> {
		const container = this.ctx.container;
		if (container === undefined) throw new ContainerUnavailableError();

		const signal = AbortSignal.any([params.signal, AbortSignal.timeout(params.requestTimeoutMs)]);
		const response = await raceWithSignal(
			() => {
				const pending = container.getTcpPort(ContainerConfig.port).fetch("http://container/health", { signal: signal });

				void pending.then(
					(response) => {
						if (signal.aborted) void response.body?.cancel().catch(() => undefined);
					},
					() => undefined,
				);

				return pending;
			},
			{ createAbortError: () => new ContainerOperationTimedOutError(), signal: signal },
		);

		const cancellation = response.body?.cancel() ?? Promise.resolve();
		void cancellation.catch(() => undefined);
		await raceWithSignal(() => cancellation, {
			createAbortError: () => new ContainerOperationTimedOutError(),
			signal: signal,
		});
		signal.throwIfAborted();
		if (!response.ok) throw new ContainerReadinessFailedError({ message: "Native Container not ready" });
	}
}
