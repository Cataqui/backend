import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JobStatus } from "../../../generated/prisma/client.js";
import { AiTask } from "../ai/ai-task.enum";
import { AiService } from "../ai/ai.service";
import { LocationService } from "../location/location.service";
import { UserService } from "../user/user.service";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

const outboundCallMock = vi.hoisted(() => vi.fn());

vi.mock("../../platform/cloudflare/containers/api/outbound/api-container-outbound", () => ({
	outboundCall: outboundCallMock,
}));

const createdAt = new Date("2026-07-30T12:00:00.000Z");
const posterUserId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const persistedDraft = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: null,
	description: "Descrição completa da oportunidade.",
	descriptionSummary: null,
	contact: null,
	street: null,
	neighborhood: null,
	city: null,
	state: null,
	country: null,
	locationPoint: null,
	fuzzyLatitude: null,
	fuzzyLongitude: null,
	status: JobStatus.DRAFT,
	type: null,
	paymentType: null,
	paymentMinAmount: null,
	paymentMaxAmount: null,
	paymentNote: null,
	paymentAmountPeriod: null,
	paymentCurrency: null,
	createdAt: createdAt,
	updatedAt: createdAt,
};

describe("JobService job data derivation", () => {
	let service: JobService;
	let aiService: { generateObject: ReturnType<typeof vi.fn> };
	let jobRepository: {
		createDraft: ReturnType<typeof vi.fn>;
		findById: ReturnType<typeof vi.fn>;
		updateDerivedJobDataIfDescriptionUnchanged: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		vi.restoreAllMocks();
		outboundCallMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
		aiService = { generateObject: vi.fn() };
		jobRepository = {
			createDraft: vi.fn(),
			findById: vi.fn(),
			updateDerivedJobDataIfDescriptionUnchanged: vi.fn().mockResolvedValue(undefined),
		};

		const module = await Test.createTestingModule({
			providers: [
				JobService,
				{ provide: AiService, useValue: aiService },
				{ provide: JobRepository, useValue: jobRepository },
				{
					provide: UserService,
					useValue: { getOrAddContact: vi.fn() },
				},
				{ provide: LocationService, useValue: { fuzzCoordinate: vi.fn() } },
			],
		}).compile();

		service = module.get(JobService);
	});

	it("should return the bare persisted draft", async () => {
		jobRepository.createDraft.mockResolvedValue(persistedDraft);

		const result = await service.createDraft({
			posterUserId: posterUserId,
			dto: Object.assign({}, { description: persistedDraft.description }),
		});

		expect(result).toMatchObject({ title: null, descriptionSummary: null });
	});

	it("should not request AI while creating a draft", async () => {
		jobRepository.createDraft.mockResolvedValue(persistedDraft);

		await service.createDraft({
			posterUserId: posterUserId,
			dto: Object.assign({}, { description: persistedDraft.description }),
		});

		expect(aiService.generateObject).not.toHaveBeenCalled();
	});

	it("should publish job data derivation after persisting a draft", async () => {
		jobRepository.createDraft.mockResolvedValue(persistedDraft);

		await service.createDraft({
			posterUserId: posterUserId,
			dto: Object.assign({}, { description: persistedDraft.description }),
		});

		expect(outboundCallMock).toHaveBeenCalledWith({
			host: "derive-job-data.queue",
			body: { jobId: persistedDraft.id },
		});
	});

	it("should not fail draft creation when the Queue operation is unavailable", async () => {
		jobRepository.createDraft.mockResolvedValue(persistedDraft);
		outboundCallMock.mockResolvedValue(new Response(null, { status: 503 }));
		vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await expect(
			service.createDraft({
				posterUserId: posterUserId,
				dto: Object.assign({}, { description: persistedDraft.description }),
			}),
		).resolves.toBeDefined();
	});

	it("should log an unsuccessful Queue operation without its response body", async () => {
		jobRepository.createDraft.mockResolvedValue(persistedDraft);
		outboundCallMock.mockResolvedValue(new Response("private body", { status: 503 }));
		const loggerError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await service.createDraft({
			posterUserId: posterUserId,
			dto: Object.assign({}, { description: persistedDraft.description }),
		});

		expect(loggerError).toHaveBeenCalledWith({
			event: "job_data_derivation.queue_publish_failed",
			jobId: persistedDraft.id,
			status: 503,
		});
	});

	it("should not fail draft creation when the outbound host cannot be reached", async () => {
		jobRepository.createDraft.mockResolvedValue(persistedDraft);
		outboundCallMock.mockRejectedValue(new Error("outbound host unavailable"));
		vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await expect(
			service.createDraft({
				posterUserId: posterUserId,
				dto: Object.assign({}, { description: persistedDraft.description }),
			}),
		).resolves.toBeDefined();
	});

	it("should log outbound transport failures without their error details", async () => {
		jobRepository.createDraft.mockResolvedValue(persistedDraft);
		outboundCallMock.mockRejectedValue(new Error("private transport details"));
		const loggerError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

		await service.createDraft({
			posterUserId: posterUserId,
			dto: Object.assign({}, { description: persistedDraft.description }),
		});

		expect(loggerError).toHaveBeenCalledWith({
			event: "job_data_derivation.queue_publish_failed",
			jobId: persistedDraft.id,
			status: null,
		});
	});

	it("should not write feed metadata while creating a draft", async () => {
		jobRepository.createDraft.mockResolvedValue(persistedDraft);

		await service.createDraft({
			posterUserId: posterUserId,
			dto: Object.assign({}, { description: persistedDraft.description }),
		});

		expect(jobRepository.updateDerivedJobDataIfDescriptionUnchanged).not.toHaveBeenCalled();
	});

	it("should not request AI when queued derivation cannot find a job", async () => {
		jobRepository.findById.mockResolvedValue(null);

		await service.deriveDataForJob({ jobId: persistedDraft.id });

		expect(aiService.generateObject).not.toHaveBeenCalled();
	});

	it("should derive job data even when the existing metadata is already complete", async () => {
		jobRepository.findById.mockResolvedValue({
			...persistedDraft,
			title: "Auxiliar de cozinha",
			descriptionSummary: "Preparar alimentos e organizar a cozinha",
		});
		aiService.generateObject.mockResolvedValue({
			title: "Auxiliar de cozinha atualizado",
			description_summary: "Preparar alimentos e organizar a cozinha com novos detalhes",
		});

		await service.deriveDataForJob({ jobId: persistedDraft.id });

		expect(jobRepository.updateDerivedJobDataIfDescriptionUnchanged).toHaveBeenCalledWith({
			jobId: persistedDraft.id,
			description: persistedDraft.description,
			title: "Auxiliar de cozinha atualizado",
			descriptionSummary: "Preparar alimentos e organizar a cozinha com novos detalhes",
		});
	});

	it("should fill missing metadata for an active job", async () => {
		jobRepository.findById.mockResolvedValue({ ...persistedDraft, status: JobStatus.ACTIVE });
		aiService.generateObject.mockResolvedValue({
			title: "Auxiliar de cozinha",
			description_summary: "Preparar alimentos e organizar a cozinha",
		});

		await service.deriveDataForJob({ jobId: persistedDraft.id });

		expect(jobRepository.updateDerivedJobDataIfDescriptionUnchanged).toHaveBeenCalledWith({
			jobId: persistedDraft.id,
			description: persistedDraft.description,
			title: "Auxiliar de cozinha",
			descriptionSummary: "Preparar alimentos e organizar a cozinha",
		});
	});

	it("should derive both job data fields when both are missing", async () => {
		jobRepository.findById.mockResolvedValue(persistedDraft);
		aiService.generateObject.mockResolvedValue({
			title: "Auxiliar de cozinha",
			description_summary: "Preparar alimentos e organizar a cozinha",
		});

		await service.deriveDataForJob({ jobId: persistedDraft.id });

		expect(jobRepository.updateDerivedJobDataIfDescriptionUnchanged).toHaveBeenCalledWith({
			jobId: persistedDraft.id,
			description: persistedDraft.description,
			title: "Auxiliar de cozinha",
			descriptionSummary: "Preparar alimentos e organizar a cozinha",
		});
	});

	it("should refresh the complete derived pair when the summary is missing", async () => {
		jobRepository.findById.mockResolvedValue({ ...persistedDraft, title: "Título anterior" });
		aiService.generateObject.mockResolvedValue({
			title: "Título gerado",
			description_summary: "Resumo gerado",
		});

		await service.deriveDataForJob({ jobId: persistedDraft.id });

		expect(jobRepository.updateDerivedJobDataIfDescriptionUnchanged).toHaveBeenCalledWith({
			jobId: persistedDraft.id,
			description: persistedDraft.description,
			title: "Título gerado",
			descriptionSummary: "Resumo gerado",
		});
	});

	it("should refresh the complete derived pair when the title is missing", async () => {
		jobRepository.findById.mockResolvedValue({ ...persistedDraft, descriptionSummary: "Resumo anterior" });
		aiService.generateObject.mockResolvedValue({
			title: "Título gerado",
			description_summary: "Resumo gerado",
		});

		await service.deriveDataForJob({ jobId: persistedDraft.id });

		expect(jobRepository.updateDerivedJobDataIfDescriptionUnchanged).toHaveBeenCalledWith({
			jobId: persistedDraft.id,
			description: persistedDraft.description,
			title: "Título gerado",
			descriptionSummary: "Resumo gerado",
		});
	});

	it("should trim a valid generated title", async () => {
		aiService.generateObject.mockResolvedValue({
			title: "  Auxiliar de cozinha  ",
			description_summary: "  Preparar alimentos e organizar a cozinha  ",
		});

		const result = await service.getDerivedJobDataFromDescription({
			description: "Vaga de auxiliar de cozinha.",
		});

		expect(result).toEqual({
			title: "Auxiliar de cozinha",
			descriptionSummary: "Preparar alimentos e organizar a cozinha",
		});
	});

	it("should reject an explicit null title", async () => {
		aiService.generateObject.mockResolvedValue({ title: null, description_summary: "Resumo válido" });

		await expect(
			service.getDerivedJobDataFromDescription({ description: "Precisamos de ajuda." }),
		).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
	});

	it("should accept a one-character generated title", async () => {
		aiService.generateObject.mockResolvedValue({ title: "A", description_summary: "Resumo válido" });

		const result = await service.getDerivedJobDataFromDescription({ description: "Uma descrição válida." });

		expect(result.title).toBe("A");
	});

	it("should preserve a generated title longer than one hundred characters", async () => {
		aiService.generateObject.mockResolvedValue({
			title: "A".repeat(101),
			description_summary: "Resumo válido",
		});

		const result = await service.getDerivedJobDataFromDescription({ description: "Uma descrição válida." });

		expect(result.title).toBe("A".repeat(101));
	});

	it("should reject a missing title from a malformed generated object", async () => {
		aiService.generateObject.mockResolvedValue({
			description_summary: "Resumo válido",
			payment: { min_amount: 500 },
		});

		await expect(
			service.getDerivedJobDataFromDescription({ description: "Uma descrição válida." }),
		).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
	});

	it("should reject a missing description summary", async () => {
		aiService.generateObject.mockResolvedValue({ title: "Auxiliar de cozinha" });

		await expect(
			service.getDerivedJobDataFromDescription({ description: "Uma descrição válida." }),
		).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
	});

	it("should preserve a description summary longer than the previous feed preview", async () => {
		aiService.generateObject.mockResolvedValue({
			title: "Auxiliar de cozinha",
			description_summary: "A".repeat(116),
		});

		const result = await service.getDerivedJobDataFromDescription({ description: "Uma descrição válida." });

		expect(result.descriptionSummary).toBe("A".repeat(116));
	});

	it("should preserve a generated title longer than the preferred display length", async () => {
		aiService.generateObject.mockResolvedValue({
			title: "A".repeat(161),
			description_summary: "Resumo válido",
		});

		const result = await service.getDerivedJobDataFromDescription({ description: "Uma descrição válida." });

		expect(result.title).toBe("A".repeat(161));
	});

	it("should preserve a generated summary longer than the preferred display length", async () => {
		aiService.generateObject.mockResolvedValue({
			title: "Título válido",
			description_summary: "A".repeat(501),
		});

		const result = await service.getDerivedJobDataFromDescription({ description: "Uma descrição válida." });

		expect(result.descriptionSummary).toBe("A".repeat(501));
	});

	it("should reject a non-object generated value", async () => {
		aiService.generateObject.mockResolvedValue("invalid");

		await expect(
			service.getDerivedJobDataFromDescription({ description: "Uma descrição válida." }),
		).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
	});

	it("should reject extra properties that bypass structured output validation", async () => {
		aiService.generateObject.mockResolvedValue({
			title: "Fotografia de evento",
			description_summary: "Registrar os principais momentos de um evento",
			type: "CONTRACTOR",
			payment: { min_amount: 500 },
			contact: "ignored",
		});

		await expect(
			service.getDerivedJobDataFromDescription({ description: "Fotografar um evento." }),
		).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
	});

	it("should return the unavailable error for gateway failures", async () => {
		aiService.generateObject.mockRejectedValue(new Error("gateway unavailable"));

		await expect(
			service.getDerivedJobDataFromDescription({ description: "Descrição válida durante uma falha do gateway." }),
		).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
	});

	it("should configure job data derivation as one bounded schema-constrained request", async () => {
		aiService.generateObject.mockResolvedValue({
			title: "Ajuda geral",
			description_summary: "Ajudar com uma oportunidade sem detalhes adicionais",
		});

		await service.getDerivedJobDataFromDescription({ description: "Uma descrição de vaga sem detalhes adicionais." });

		expect(aiService.generateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				task: AiTask.DERIVE_JOB_DATA,
				schemaDescription:
					"A concise title and complementary feed summary grounded exclusively in the supplied job description.",
				maxTokens: 10_000,
				abortSignal: expect.any(AbortSignal),
			}),
		);
	});

	it("should let the model infer the description language without an external language hint", async () => {
		aiService.generateObject.mockResolvedValue({
			title: "Instalar WhatsApp no celular",
			description_summary: "Configurar o WhatsApp no celular do solicitante",
		});

		await service.getDerivedJobDataFromDescription({ description: "preciso de alquen pa intala zapzap nu mey celula" });

		expect(aiService.generateObject).toHaveBeenCalledWith(
			expect.objectContaining({
				system: expect.stringContaining("Infer the description's dominant language"),
			}),
		);
	});
});
