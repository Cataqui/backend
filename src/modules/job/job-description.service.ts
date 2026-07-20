import { Injectable, Logger } from "@nestjs/common";
import { AiGatewayJobTypeModel } from "../../core/ai/ai-gateway-job-type-model";
import { AiGatewayService } from "../../core/ai/ai-gateway-service";
import { LocaleUtils } from "../../shared/locale/locale.utils";
import { JobConstants } from "./constants/job.constants";
import { JobDescriptionSummaryPrompts } from "./prompts/job-description-summary-prompts";
import { JobRepository } from "./repositories/job.repository";

@Injectable()
export class JobDescriptionService {
	private readonly _logger = new Logger(JobDescriptionService.name);

	constructor(
		private readonly _aiGatewayService: AiGatewayService,
		private readonly _jobRepository: JobRepository,
	) {}

	async improveDescriptionSummary({
		jobId,
		title,
		description,
	}: {
		jobId: string;
		title: string;
		description: string;
	}): Promise<void> {
		const languageCode = LocaleUtils.detectTextLocaleAsISO6393(description);

		const rawSummary = await this._aiGatewayService.generateText({
			jobType: AiGatewayJobTypeModel.SUMMARIZE,
			system: JobDescriptionSummaryPrompts.buildSystemPrompt(languageCode),
			prompt: JobDescriptionSummaryPrompts.buildUserPrompt({
				description: description,
				title: title,
				languageCode: languageCode,
			}),
			temperature: 0,
			maxTokens: JobConstants.DESCRIPTION_SUMMARY_MAX_TOKENS,
			abortSignal: AbortSignal.timeout(JobConstants.DESCRIPTION_SUMMARY_TIMEOUT_MS),
		});

		let summaryCandidate = this._cleanGeneratedDescriptionSummaryText(rawSummary);

		if (summaryCandidate.length === 0) return;

		const shortenThreshold = Math.ceil(
			JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH *
				(1 + JobConstants.DESCRIPTION_SUMMARY_MAX_LENGTH_OVER_PERCENTAGE / 100),
		);

		if (summaryCandidate.length > shortenThreshold) {
			const shortened = await this._shortenDescriptionSummary({
				summary: summaryCandidate,
				title: title,
				languageCode: languageCode,
			});

			const shortenedCandidate = this._cleanGeneratedDescriptionSummaryText(shortened);

			if (shortenedCandidate.length > 0) summaryCandidate = shortenedCandidate;
		}

		const outputLanguageCode = LocaleUtils.detectTextLocaleAsISO6393(summaryCandidate);

		if (outputLanguageCode !== languageCode) {
			this._logger.warn(
				`Summary language mismatch (expected=${languageCode}, got=${outputLanguageCode}) for job ${jobId}. Keeping generated summary.`,
			);
		}

		await this._jobRepository.updateDescriptionSummary({ jobId: jobId, summary: summaryCandidate });
	}

	private async _shortenDescriptionSummary({
		summary,
		title,
		languageCode,
	}: {
		summary: string;
		title: string;
		languageCode: string;
	}): Promise<string> {
		try {
			const result = await this._aiGatewayService.generateText({
				jobType: AiGatewayJobTypeModel.SUMMARIZE,
				system: JobDescriptionSummaryPrompts.buildShortenSystemPrompt(languageCode),
				prompt: JobDescriptionSummaryPrompts.buildShortenUserPrompt({
					summary: summary,
					title: title,
					languageCode: languageCode,
				}),
				temperature: 0,
				maxTokens: JobConstants.DESCRIPTION_SUMMARY_MAX_TOKENS,
				abortSignal: AbortSignal.timeout(JobConstants.DESCRIPTION_SUMMARY_TIMEOUT_MS),
			});
			return result.trim();
		} catch (error) {
			this._logger.error("Failed to shorten description summary:", error);
			return "";
		}
	}

	private _cleanGeneratedDescriptionSummaryText(summary: string): string {
		return summary
			.replace(/<\/?(?:summary|shortened_summary|summary_to_shorten)>/giu, " ")
			.replace(/^\s*(?:summary|shortened summary|resumo|resumen)\s*:\s*/iu, "")
			.replace(/[\r\n\t]+/g, " ")
			.replace(/\s+/g, " ")
			.replace(/\s+([,;:])/g, "$1")
			.replace(/^[\s"'`.,;:!?-]+/g, "")
			.replace(/[\s"'`.,;:!?-]+$/g, "")
			.trim();
	}
}
