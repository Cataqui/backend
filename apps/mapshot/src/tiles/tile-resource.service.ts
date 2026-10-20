import { AppError, RenderingAbortedError, RenderingResourceUnavailableError } from "../errors/index";
import { raceWithSignal } from "@cataqui/async";
import { injectable } from "tsyringe";
import { MapSourceService } from "../source/map-source.service";

import type { BasemapResourceRevision } from "./schemas/basemap-resource-revision.schema";

type _Resource = { bytes: Uint8Array; revision: BasemapResourceRevision };
interface _PendingResource {
	controller: AbortController;
	operation: Promise<_Resource>;
	drained: Promise<void>;
	subscribers: number;
	settled: boolean;
}

@injectable()
export class TileResourceService {
	private static readonly _maximumRawResources = 2048;

	constructor(private readonly _mapSourceService: MapSourceService) {}
	private readonly _cached = new Map<string, Uint8Array>();
	private readonly _pending = new Map<string, _PendingResource>();
	private readonly _active = new Set<_PendingResource>();
	private _closing = false;
	private readonly _storedRevisions = new Map<string, BasemapResourceRevision>();
	private _cachedBytes = 0;

	async read(params: { path: string; signal?: AbortSignal | undefined }): Promise<_Resource> {
		if (params.signal?.aborted) throw new RenderingAbortedError();
		if (this._closing) throw new RenderingResourceUnavailableError();
		const key = params.path;
		const revision = this._storedRevisions.get(key);
		if (revision !== undefined) {
			const cached = this._cached.get(revision.id);
			if (cached !== undefined) {
				this._cached.delete(revision.id);
				this._cached.set(revision.id, cached);
				this._rememberStoredRevision({ key: key, revision: revision });
				return { bytes: cached, revision: revision };
			}
		}

		let pending = this._pending.get(key);
		if (pending === undefined) {
			const controller = new AbortController();
			const provider = this._mapSourceService
				.readResource({ path: params.path, signal: controller.signal })
				.then((resource): _Resource => {
					if (controller.signal.aborted) throw new RenderingResourceUnavailableError();
					const bytes = resource.bytes;
					const revision = resource.revision;
					const length = bytes.byteLength;
					const maximumCachedBytes = 64 * 1024 * 1024;
					if (length > maximumCachedBytes) return resource;
					const existing = this._cached.get(revision.id);
					if (existing !== undefined) {
						this._cached.delete(revision.id);
						this._cachedBytes -= existing.byteLength;
					}
					while (
						(this._cachedBytes + length > maximumCachedBytes ||
							this._cached.size >= TileResourceService._maximumRawResources) &&
						this._cached.size > 0
					) {
						const oldest = this._cached.entries().next().value;
						if (oldest === undefined) break;
						this._cached.delete(oldest[0]);
						this._cachedBytes -= oldest[1].byteLength;
					}
					this._cached.set(revision.id, bytes);
					this._cachedBytes += length;
					return resource;
				});
			const operation = raceWithSignal(() => provider, {
				signal: controller.signal,
				createAbortError: () => new RenderingResourceUnavailableError(),
			}).catch((error: unknown): never => {
				if (error instanceof AppError) throw error;
				throw new RenderingResourceUnavailableError();
			});
			const drained = provider
				.then(
					() => undefined,
					() => undefined,
				)
				.finally(() => this._active.delete(created));
			const created: _PendingResource = {
				controller: controller,
				operation: operation,
				drained: drained,
				subscribers: 0,
				settled: false,
			};
			this._pending.set(key, created);
			this._active.add(created);
			const complete = (): void => {
				created.settled = true;
				if (this._pending.get(key) === created) this._pending.delete(key);
			};
			void operation.then(complete, complete);
			pending = created;
		}
		const subscription = pending;
		subscription.subscribers += 1;
		let resource: _Resource;
		try {
			resource = await raceWithSignal(() => subscription.operation, {
				signal: params.signal,
				createAbortError: () => new RenderingAbortedError(),
			});
		} finally {
			subscription.subscribers -= 1;
			if (subscription.subscribers === 0 && !subscription.settled) {
				if (this._pending.get(key) === subscription) this._pending.delete(key);
				subscription.controller.abort();
			}
		}
		if (params.signal?.aborted) throw new RenderingAbortedError();
		this._rememberStoredRevision({ key: key, revision: resource.revision });
		return resource;
	}

	async close(): Promise<void> {
		this._closing = true;
		for (const pending of this._active) pending.controller.abort();
		await Promise.all([...this._active].map((pending) => pending.drained));
		this._pending.clear();
		this._cached.clear();
		this._storedRevisions.clear();
		this._cachedBytes = 0;
	}

	private _rememberStoredRevision(params: { key: string; revision: BasemapResourceRevision }): void {
		this._storedRevisions.delete(params.key);
		if (this._storedRevisions.size >= TileResourceService._maximumRawResources) {
			const oldest = this._storedRevisions.keys().next().value;
			if (oldest !== undefined) this._storedRevisions.delete(oldest);
		}
		this._storedRevisions.set(params.key, params.revision);
	}
}
