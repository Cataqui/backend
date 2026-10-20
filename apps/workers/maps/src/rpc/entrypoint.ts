import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import { toValidationViolations } from "@cataqui/response";
import {
	GetStaticMapLocationUrlInputSchema,
	type GetStaticMapLocationUrlInput,
} from "../static/get-static-map-location-url-input.schema";
import type { GetStaticMapLocationUrlOutput } from "../static/get-static-map-location-url-output.schema";
import { WorkerEntrypoint as CloudflareWorkerEntrypoint } from "cloudflare:workers";
import { container } from "tsyringe";
import { registerMapsDependencies } from "../maps-dependencies";
import { LocationReferenceService } from "../static/location-reference.service";
import { AppError } from "../errors/app.error";
import { StaticMapLocationInvalidError } from "./errors/static-map-location-invalid.error";
import { StaticMapUrlGenerationFailedError } from "./errors/static-map-url-generation-failed.error";

export class WorkerEntrypoint extends CloudflareWorkerEntrypoint<MapsWorkerEnv> {
	async getStaticMapLocationUrl(input: GetStaticMapLocationUrlInput): Promise<GetStaticMapLocationUrlOutput> {
		const parsed = GetStaticMapLocationUrlInputSchema.safeParse(input);
		if (!parsed.success)
			throw new StaticMapLocationInvalidError({
				violations: toValidationViolations({ issues: parsed.error.issues }),
			});

		const scope = container.createChildContainer();
		try {
			registerMapsDependencies({ container: scope, environment: this.env });
			return await scope.resolve(LocationReferenceService).createUrl(parsed.data);
		} catch (error) {
			if (error instanceof AppError) throw error;
			throw new StaticMapUrlGenerationFailedError();
		} finally {
			await scope.dispose();
		}
	}
}
