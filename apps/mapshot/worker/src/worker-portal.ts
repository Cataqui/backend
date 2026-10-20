import type { MapshotWorkerEnv } from "../cloudflare.config.ts";
import type { MapshotWorkerPortal as MapshotWorkerPortalDefinition } from "@cataqui/mapshot-workerhole";
import { WorkerPortal } from "@cataqui/workerhole/worker";
import { createR2Service } from "./r2/r2.module";

export class MapshotWorkerPortal extends WorkerPortal<MapshotWorkerEnv, typeof MapshotWorkerPortalDefinition> {
	override readonly expose: WorkerPortal<MapshotWorkerEnv, typeof MapshotWorkerPortalDefinition>["expose"] = {
		readObjectByteRange: (input, context) =>
			createR2Service({
				bucket: this.env.R2,
			}).readObjectByteRange({
				key: input.key,
				etag: input.etag,
				offset: input.offset,
				length: input.length,
				signal: context.signal,
			}),
	};
}
