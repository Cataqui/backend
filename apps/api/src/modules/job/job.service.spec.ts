import { Test } from "@nestjs/testing";
import { Prisma, JobStatus } from "../../../generated/prisma/client.js";
import { AiService } from "../ai/ai.service";
import { LocationService } from "../location/location.service";
import { UserService } from "../user/user.service";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobIdempotencyConflictError } from "./errors/job-idempotency-conflict.error";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

const dto = {
	description: "Preciso de ajuda para descarregar caixas amanhã. Pago R$ 150 por dia.",
	location: { latitude: -23.55, longitude: -46.63 },
	contact: { contactMethod: "WHATSAPP" as const, identifier: "+5511999999999" },
};
const job = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: "Descarregar caixas",
	description: dto.description,
	descriptionSummary: "Trabalho de um dia",
	payment: "R$ 150 por dia",
	contact: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", contactMethod: "WHATSAPP" as const },
	fuzzyLatitude: new Prisma.Decimal(-23.55),
	fuzzyLongitude: new Prisma.Decimal(-46.63),
	status: JobStatus.ACTIVE,
	createdAt: new Date("2026-09-22T12:00:00Z"),
	updatedAt: new Date("2026-09-22T12:00:00Z"),
};
const params = {
	dto: dto,
	posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
	idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

describe("JobService direct posting", () => {
	let service: JobService;
	const repository = {
		findByIdempotencyKey: vi.fn(),
		createJob: vi.fn(),
		findPublicById: vi.fn(),
		findActiveJobContact: vi.fn(),
	};
	const ai = { generateObject: vi.fn() };
	const users = { getOrAddContact: vi.fn() };
	const location = { fuzzCoordinate: vi.fn() };

	beforeEach(async () => {
		vi.resetAllMocks();
		repository.findByIdempotencyKey.mockResolvedValue(null);
		repository.createJob.mockResolvedValue(job);
		ai.generateObject.mockResolvedValue({
			title: job.title,
			description_summary: job.descriptionSummary,
			payment: job.payment,
		});
		users.getOrAddContact.mockResolvedValue({ contactId: job.contact.id });
		location.fuzzCoordinate.mockReturnValue(dto.location);
		const module = await Test.createTestingModule({
			providers: [
				JobService,
				{ provide: JobRepository, useValue: repository },
				{ provide: AiService, useValue: ai },
				{ provide: UserService, useValue: users },
				{ provide: LocationService, useValue: location },
			],
		}).compile();
		service = module.get(JobService);
	});

	it("creates one active post after deriving title, summary, and payment", async () => {
		const result = await service.createJob(params);
		expect(result).toMatchObject({ jobId: job.id, payment: job.payment, status: "ACTIVE" });
		expect(ai.generateObject).toHaveBeenCalledOnce();
		expect(repository.createJob).toHaveBeenCalledWith(
			expect.objectContaining({
				payment: job.payment,
				description: dto.description,
				location: dto.location,
				fuzzyLocation: dto.location,
				requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
			}),
		);
	});

	it("persists null when the description does not state compensation", async () => {
		ai.generateObject.mockResolvedValue({
			title: job.title,
			description_summary: job.descriptionSummary,
			payment: null,
		});
		repository.createJob.mockResolvedValue({ ...job, payment: null });
		const result = await service.createJob({
			...params,
			dto: { ...dto, description: "Preciso de ajuda para descarregar caixas amanhã." },
		});
		expect(repository.createJob).toHaveBeenCalledWith(expect.objectContaining({ payment: null }));
		expect(result.payment).toBeNull();
	});

	it("normalizes whitespace-only derived payment to null before writing the job", async () => {
		ai.generateObject.mockResolvedValue({
			title: job.title,
			description_summary: job.descriptionSummary,
			payment: "   ",
		});
		await service.createJob(params);
		expect(repository.createJob).toHaveBeenCalledWith(expect.objectContaining({ payment: null }));
	});

	it("rejects a missing payment field before writing the job", async () => {
		ai.generateObject.mockResolvedValue({ title: job.title, description_summary: job.descriptionSummary });
		await expect(service.createJob(params)).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
		expect(repository.createJob).not.toHaveBeenCalled();
	});

	it("returns the original post on an identical retry without deriving again", async () => {
		const requestHash = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		repository.findByIdempotencyKey.mockResolvedValue({ job: job, requestHash: requestHash });
		expect((await service.createJob(params)).jobId).toBe(job.id);
		expect(ai.generateObject).not.toHaveBeenCalled();
		expect(repository.createJob).not.toHaveBeenCalled();
	});

	it("rejects a reused key with different post content", async () => {
		repository.findByIdempotencyKey.mockResolvedValue({ job: job, requestHash: "0".repeat(64) });
		await expect(service.createJob(params)).rejects.toBeInstanceOf(JobIdempotencyConflictError);
	});

	it("leaves no job when derivation fails", async () => {
		ai.generateObject.mockRejectedValue(new Error("gateway unavailable"));
		await expect(service.createJob(params)).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
		expect(repository.createJob).not.toHaveBeenCalled();
	});

	it("returns the original null-payment post on an identical retry", async () => {
		const requestHash = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		repository.findByIdempotencyKey.mockResolvedValue({ job: { ...job, payment: null }, requestHash: requestHash });
		expect((await service.createJob(params)).payment).toBeNull();
		expect(ai.generateObject).not.toHaveBeenCalled();
		expect(repository.createJob).not.toHaveBeenCalled();
	});

	it("returns the winning post after a concurrent insert collision", async () => {
		const requestHash = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		repository.findByIdempotencyKey
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ job: job, requestHash: requestHash });
		repository.createJob.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.9.1" }),
		);
		expect((await service.createJob(params)).jobId).toBe(job.id);
	});
});
