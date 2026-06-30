import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AiGatewayJobTypeModel } from "../../core/ai/ai-gateway-job-type-model";
import { AiGatewayService } from "../../core/ai/ai-gateway-service";
import { LocaleUtils } from "../../shared/locale/locale.utils";
import { JobDescriptionService } from "./job-description.service";
import { JobConstants } from "./job.constants";
import { JobDescriptionSummaryPrompts } from "./prompts/job-description-summary-prompts";
import { JobRepository } from "./repositories/job.repository";

vi.mock("../../shared/locale/locale.utils", () => ({
	LocaleUtils: {
		detectTextLocaleAsISO6393: vi.fn().mockReturnValue("eng"),
	},
}));

describe("JobDescriptionService", () => {
	let service: JobDescriptionService;
	let aiGatewayService: { generateText: ReturnType<typeof vi.fn> };
	let jobRepository: { updateDescriptionSummary: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		(LocaleUtils.detectTextLocaleAsISO6393 as ReturnType<typeof vi.fn>).mockReturnValue("eng");

		aiGatewayService = {
			generateText: vi.fn().mockResolvedValue(""),
		};
		jobRepository = {
			updateDescriptionSummary: vi.fn().mockResolvedValue(undefined),
		};

		const module = await Test.createTestingModule({
			providers: [
				JobDescriptionService,
				{ provide: AiGatewayService, useValue: aiGatewayService },
				{ provide: JobRepository, useValue: jobRepository },
			],
		}).compile();

		service = module.get(JobDescriptionService);
	});

	it("should call AI to generate a description summary", async () => {
		aiGatewayService.generateText.mockResolvedValue("Short summary");

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(aiGatewayService.generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				jobType: AiGatewayJobTypeModel.SUMMARIZE,
				system: JobDescriptionSummaryPrompts.buildSystemPrompt("eng"),
				prompt: JobDescriptionSummaryPrompts.buildUserPrompt({
					description: "Need someone to help unload a delivery truck.",
					title: "Help unload truck",
					languageCode: "eng",
				}),
				temperature: 0,
				maxTokens: JobConstants.DESCRIPTION_SUMMARY_MAX_TOKENS,
				abortSignal: expect.any(AbortSignal),
			}),
		);
	});

	it("should not update description summary when AI returns empty text", async () => {
		aiGatewayService.generateText.mockResolvedValue("   ");

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).not.toHaveBeenCalled();
	});

	it("should preserve AI-generated summary when it is within DESCRIPTION_SUMMARY_MAX_LENGTH", async () => {
		const shortSummary = "d".repeat(50);
		aiGatewayService.generateText.mockResolvedValue(shortSummary);

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).toHaveBeenCalledWith({
			jobId: "cm3x-job-1",
			summary: shortSummary,
		});
	});

	it("should not call AI to shorten when the summary is within the limit", async () => {
		aiGatewayService.generateText.mockResolvedValue("d".repeat(50));

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(aiGatewayService.generateText).toHaveBeenCalledTimes(1);
	});

	it("should call AI to shorten when the summary exceeds the over-threshold", async () => {
		const summaryOverThreshold = "c".repeat(116);
		const shortSummary = "c".repeat(80);
		aiGatewayService.generateText.mockResolvedValueOnce(summaryOverThreshold).mockResolvedValueOnce(shortSummary);

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(aiGatewayService.generateText).toHaveBeenCalledTimes(2);
	});

	it("should pass the shorten prompt on the second AI call", async () => {
		const summaryOverThreshold = "c".repeat(116);
		const shortSummary = "c".repeat(80);
		aiGatewayService.generateText.mockResolvedValueOnce(summaryOverThreshold).mockResolvedValueOnce(shortSummary);

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(aiGatewayService.generateText).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				system: JobDescriptionSummaryPrompts.buildShortenSystemPrompt("eng"),
			}),
		);
	});

	it("should use the shortened summary when the second call succeeds", async () => {
		const longSummary = "c".repeat(150);
		const shortSummary = "c".repeat(80);
		aiGatewayService.generateText.mockResolvedValueOnce(longSummary).mockResolvedValueOnce(shortSummary);

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).toHaveBeenCalledWith({
			jobId: "cm3x-job-1",
			summary: shortSummary,
		});
	});

	it("should preserve the shortened summary even when it still exceeds the ideal limit", async () => {
		const longSummary = "c".repeat(150);
		const stillLongSummary = "c".repeat(120);
		aiGatewayService.generateText.mockResolvedValueOnce(longSummary).mockResolvedValueOnce(stillLongSummary);

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).toHaveBeenCalledWith({
			jobId: "cm3x-job-1",
			summary: stillLongSummary,
		});
	});

	it("should preserve the original summary when the shorten call throws", async () => {
		const longSummary = "c".repeat(150);
		aiGatewayService.generateText.mockResolvedValueOnce(longSummary).mockRejectedValueOnce(new Error("AI timeout"));

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).toHaveBeenCalledWith({
			jobId: "cm3x-job-1",
			summary: longSummary,
		});
	});

	it("should preserve the original summary when the shorten call returns empty", async () => {
		const longSummary = "c".repeat(150);
		aiGatewayService.generateText.mockResolvedValueOnce(longSummary).mockResolvedValueOnce("   ");

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).toHaveBeenCalledWith({
			jobId: "cm3x-job-1",
			summary: longSummary,
		});
	});

	it("should not call AI to shorten when the summary is within the over-threshold", async () => {
		const summaryWithinThreshold = "c".repeat(110);
		aiGatewayService.generateText.mockResolvedValue(summaryWithinThreshold);

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(aiGatewayService.generateText).toHaveBeenCalledTimes(1);
	});

	it("should not remove the job title from the AI summary before saving", async () => {
		const summary = "Help unload truck carrying boxes on Saturday morning";
		aiGatewayService.generateText.mockResolvedValue(summary);

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).toHaveBeenCalledWith({
			jobId: "cm3x-job-1",
			summary: summary,
		});
	});

	it("should not remove compensation amounts from the AI summary before saving", async () => {
		const summary = "Manutenção comercial com salário R$3.500,00 mais comissão";
		aiGatewayService.generateText.mockResolvedValue(summary);

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).toHaveBeenCalledWith({
			jobId: "cm3x-job-1",
			summary: summary,
		});
	});

	it("should clean generated wrapper tags before saving", async () => {
		aiGatewayService.generateText.mockResolvedValue("<summary>\nShort summary.\n</summary>");

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(jobRepository.updateDescriptionSummary).toHaveBeenCalledWith({
			jobId: "cm3x-job-1",
			summary: "Short summary",
		});
	});

	it("should detect language from the description and pass it to the system prompt", async () => {
		aiGatewayService.generateText.mockResolvedValue("d".repeat(50));

		await service.improveDescriptionSummary({
			jobId: "cm3x-job-1",
			title: "Help unload truck",
			description: "Need someone to help unload a delivery truck.",
		});

		expect(LocaleUtils.detectTextLocaleAsISO6393).toHaveBeenCalledWith("Need someone to help unload a delivery truck.");
	});
});
