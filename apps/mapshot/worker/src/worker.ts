import type { MapshotWorkerEnv } from "../cloudflare.config.ts";
import {
	MapshotRenderInputSchema,
	type MapshotRenderInput,
	type ContainerRenderOutput,
} from "@cataqui/mapshot-workerhole";
import type { MapshotContainer } from "./container";
import type { MapshotRenderOutput } from "./mapshot-render-output";
import { toValidationViolations } from "@cataqui/response";
import { WorkerEntrypoint as CloudflareWorkerEntrypoint } from "cloudflare:workers";
import { RenderValidationError } from "./errors/render-validation.error";
import { RenderingUnavailableError } from "./errors/rendering-unavailable.error";

export { ContainerProxy } from "@cloudflare/containers";
export { MapshotContainer } from "./container";
export { MapshotWorkerPortal } from "./worker-portal";

export default class WorkerEntrypoint extends CloudflareWorkerEntrypoint<MapshotWorkerEnv> {
	async render(input: MapshotRenderInput): Promise<MapshotRenderOutput> {
		const parsed = MapshotRenderInputSchema.safeParse(input);

		if (!parsed.success) {
			const violations = toValidationViolations({ issues: parsed.error.issues });

			throw new RenderValidationError({ violations: violations });
		}

		let result: ContainerRenderOutput;

		try {
			// Cross-Worker RPC inference checks this source with the caller's global ctx.exports types.
			// Keep this namespace typed against Mapshot's own container instead.
			const container = (
				this.ctx.exports as unknown as {
					MapshotContainer: DurableObjectNamespace<MapshotContainer>;
				}
			).MapshotContainer;
			result = await container.getByName("renderer-0").render(parsed.data);
		} catch {
			throw new RenderingUnavailableError();
		}

		return {
			bytes: result.bytes,
			contentType: result.metadata.contentType,
			width: result.metadata.pixelWidth,
			height: result.metadata.pixelHeight,
			digest: result.metadata.digest,
		};
	}
}
