import { DurableObject } from "cloudflare:workers";
import {
	GenerateStaticMapsInputSchema,
	type GenerateStaticMapsInput,
	type GenerateStaticMapsResult,
} from "@cataqui/maps-contracts";
import { getStaticGenerationIdentity } from "./static-identity";
import { createStaticService } from "./static.module";

export class StaticGenerationDurableObject extends DurableObject<MapsWorkerEnv> {
	private _pending: Promise<GenerateStaticMapsResult> | undefined;

	async generate(input: GenerateStaticMapsInput): Promise<GenerateStaticMapsResult> {
		const parsed = GenerateStaticMapsInputSchema.safeParse(input);
		if (!parsed.success)
			return {
				kind: "failed",
				code: "INVALID_INPUT",
				retryable: false,
				violations: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
			};
		const id = await getStaticGenerationIdentity({ input: parsed.data, environment: this.env.ENVIRONMENT });
		if (!this.ctx.id.equals(this.env.GENERATION.idFromName(id)))
			return { kind: "failed", code: "INVALID_INPUT", retryable: false };
		if (this._pending) return this._pending;

		const operation = createStaticService({ environment: this.env }).startPreparation(parsed.data);
		this._pending = operation.result;
		// Preserve deduplication after a deadline until uncancellable uploads settle.
		this.ctx.waitUntil(
			operation.settled.then(() => {
				if (this._pending === operation.result) this._pending = undefined;
			}),
		);
		return operation.result;
	}
}
