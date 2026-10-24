import type { ApiWorkerEnv } from "../cloudflare.config.ts";
import { ApiWorkerContainerPortal } from "@cataqui/api-workerhole";
import { raceWithSignal } from "@cataqui/async";
import { connectWorkerToContainer } from "@cataqui/workerhole";
import { DurableObject } from "cloudflare:workers";
import { ApiContainerStartupTimedOutError, ApiContainerUnavailableError } from "./container/api-container.error";
import { ApiWorkerPortal } from "./worker-portal";

export class ApiContainer extends DurableObject<ApiWorkerEnv, unknown> {
	private _containerPortal: ApiWorkerContainerPortal | undefined;
	private _starting: Promise<void> | undefined;
	private _monitoring: Promise<void> | undefined;
	private _healthy = false;

	constructor(context: DurableObjectState, environment: ApiWorkerEnv) {
		super(context, environment);
		const container = context.container;
		if (container?.running) {
			context.waitUntil(
				this.#_ensureReady({ container: container }).catch(() => {
					console.error({ event: "api.container.restore.failed" });
				}),
			);
		}
	}

	override async fetch(request: Request): Promise<Response> {
		try {
			const container = this.ctx.container;
			if (container === undefined) throw new ApiContainerUnavailableError();
			await this.#_ensureReady({ container: container });
			const url = new URL(request.url);
			url.protocol = "http:";
			return await container.getTcpPort(3000).fetch(new Request(url, request));
		} catch {
			this._healthy = false;
			console.error({ event: "api.container.request.failed" });
			return new Response(null, { status: 503 });
		}
	}

	async #_ensureReady(params: { container: Container }): Promise<void> {
		if (this._starting !== undefined) return this._starting;
		const canReuseReadiness = this._healthy && params.container.running;
		if (canReuseReadiness) return;
		const operation = this.#_startAndWaitUntilReady({ container: params.container });
		this._starting = operation;
		try {
			await operation;
		} finally {
			this._starting = undefined;
			if (!this._healthy) {
				console.error({ event: "api.container.start.failed", diagnosticEvent: "api.application.start.failed" });
			}
		}
	}

	async #_startAndWaitUntilReady(params: { container: Container }): Promise<void> {
		const container = params.container;
		this._containerPortal ??= connectWorkerToContainer(ApiWorkerContainerPortal, {
			idleTimeoutMs: 60_000,
			context: this.ctx,
			expose: ApiWorkerPortal,
		});
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new ApiContainerStartupTimedOutError()), 20_000);
		const signal = controller.signal;
		try {
			let configured = false;
			for (;;) {
				signal.throwIfAborted();
				try {
					const processNeedsConfiguration = !configured || !container.running;
					if (processNeedsConfiguration) {
						await this.#_startAndConfigure({ container: container, signal: signal });
						configured = true;
					}
					const processIsReady =
						(await this.#_isHealthy({ container: container, signal: signal })) && container.running;
					if (processIsReady) {
						this._healthy = true;
						return;
					}
				} catch {
					signal.throwIfAborted();
				}
				await raceWithSignal(() => new Promise((resolve) => setTimeout(resolve, 300)), { signal: signal });
				signal.throwIfAborted();
			}
		} finally {
			clearTimeout(timer);
			controller.abort();
		}
	}

	async #_startAndConfigure(params: { container: Container; signal: AbortSignal }): Promise<void> {
		params.signal.throwIfAborted();
		if (!params.container.running) {
			params.container.start({
				enableInternet: true,
				env: {
					ENVIRONMENT: this.env.ENVIRONMENT,
					DATABASE_APP_POOLER_URL: this.env.DATABASE_APP_POOLER_URL,
					CORS_ORIGINS: this.env.CORS_ORIGINS,
					CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID,
					AI_GATEWAY_API_TOKEN: this.env.AI_GATEWAY_API_TOKEN,
					AI_GATEWAY_ID: this.env.AI_GATEWAY_ID,
					UPSTASH_REDIS_REST_URL: this.env.UPSTASH_REDIS_REST_URL,
					UPSTASH_REDIS_REST_TOKEN: this.env.UPSTASH_REDIS_REST_TOKEN,
				},
			});
			this._monitoring = undefined;
		}
		this.#_observeExit({ container: params.container });
		await raceWithSignal(() => params.container.setInactivityTimeout(this.env.SLEEP_AFTER_MS), {
			signal: params.signal,
		});
		params.signal.throwIfAborted();
	}

	async #_isHealthy(params: { container: Container; signal: AbortSignal }): Promise<boolean> {
		const signal = AbortSignal.any([params.signal, AbortSignal.timeout(5_000)]);
		const response = await raceWithSignal(
			() => {
				const pending = params.container.getTcpPort(3000).fetch("http://localhost/v1/health/live", {
					signal: signal,
				});
				// An abort does not guarantee that a pending transport releases its eventual response.
				void pending.then(
					(response: Response): void => {
						if (signal.aborted) void response.body?.cancel().catch((): undefined => undefined);
					},
					(): undefined => undefined,
				);
				return pending;
			},
			{ signal: signal },
		);

		const cancellation = response.body?.cancel() ?? Promise.resolve();
		void cancellation.catch(() => undefined);
		await raceWithSignal(() => cancellation, { signal: signal });
		signal.throwIfAborted();
		return response.ok;
	}

	async #_closeRpc(): Promise<void> {
		const rpc = this._containerPortal;
		this._containerPortal = undefined;
		await rpc?.close();
	}

	#_observeExit(params: { container: Container }): void {
		if (this._monitoring !== undefined) return;
		const monitoring = params.container.monitor();
		this._monitoring = monitoring;
		this.ctx.waitUntil(
			monitoring.then(
				async (): Promise<void> => {
					const monitoredProcessWasReplaced = this._monitoring !== monitoring;
					if (monitoredProcessWasReplaced) return;
					this._monitoring = undefined;
					this._healthy = false;
					await this.#_closeRpc();
					console.info({ event: "api.container.stopped", exitCode: 0 });
				},
				async (error: unknown): Promise<void> => {
					const monitoredProcessWasReplaced = this._monitoring !== monitoring;
					if (monitoredProcessWasReplaced) return;
					this._monitoring = undefined;
					this._healthy = false;
					await this.#_closeRpc();
					console.error({
						event: "api.container.stopped",
						...(typeof error === "object" && error !== null && "exitCode" in error && typeof error.exitCode === "number"
							? { exitCode: error.exitCode }
							: {}),
					});
				},
			),
		);
	}
}
