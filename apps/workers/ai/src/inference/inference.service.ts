import { injectable } from "tsyringe";
import { InferenceUnavailableError } from "./errors/inference-unavailable.error";
import { InvalidModelResponseError } from "./errors/invalid-model-response.error";
import { InferenceRepository } from "./inference.repository";
import { type NameMeaningOutput, NameMeaningOutputSchema } from "./name-meaning-output.schema";

@injectable()
export class InferenceService {
	constructor(private readonly _repository: InferenceRepository) {}

	async getNameMeaning(params: { name: string; language: string; signal: AbortSignal }): Promise<NameMeaningOutput> {
		params.signal.throwIfAborted();

		const response = await this._repository
			.inferNameMeaning({
				name: params.name,
				language: params.language,
				signal: params.signal,
			})
			.catch(() => {
				throw new InferenceUnavailableError();
			});

		const completedNormally = response.finishReason === "stop";
		if (!completedNormally || response.content === null) throw new InvalidModelResponseError();
		let content: unknown;

		try {
			content = JSON.parse(response.content);
		} catch {
			throw new InvalidModelResponseError();
		}
		const result = NameMeaningOutputSchema.safeParse(content);
		if (!result.success) throw new InvalidModelResponseError();
		return result.data;
	}
}
