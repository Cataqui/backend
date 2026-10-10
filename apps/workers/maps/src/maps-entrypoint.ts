import {
	GenerateStaticMapsInputSchema,
	type GenerateStaticMapsInput,
	type GenerateStaticMapsResult,
	type IMapsRpc,
} from "@cataqui/maps-contracts";
import { WorkerEntrypoint } from "cloudflare:workers";
import { createStaticService } from "./modules/static/static.module";

export class MapsEntrypoint extends WorkerEntrypoint<MapsWorkerEnv> implements IMapsRpc {
	async generateStaticMaps(input: GenerateStaticMapsInput): Promise<GenerateStaticMapsResult> {
		const parsed = GenerateStaticMapsInputSchema.safeParse(input);
		if (!parsed.success)
			return {
				kind: "failed",
				code: "INVALID_INPUT",
				retryable: false,
				violations: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
			};
		return createStaticService({ environment: this.env }).generate(parsed.data);
	}
}
