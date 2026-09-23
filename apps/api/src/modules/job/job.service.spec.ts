import { Test } from "@nestjs/testing";
import { JobStatus, Prisma } from "../../../generated/prisma/client.js";
import { AiService } from "../ai/ai.service";
import { ContactService } from "../contact/contact.service";
import { LocationService } from "../location/location.service";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobIdempotencyConflictError } from "./errors/job-idempotency-conflict.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";
import { decodeUserJobsCursor, encodeUserJobsCursor } from "./utils/user-jobs-cursor.utils";

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
		findUserJobs: vi.fn(),
		findByIdempotencyKey: vi.fn(),
		createJob: vi.fn(),
		findPublicById: vi.fn(),
		archiveOwnedJob: vi.fn(),
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
				{ provide: ContactService, useValue: users },
				{ provide: LocationService, useValue: location },
			],
		}).compile();
		service = module.get(JobService);
	});

	it("returns an empty page when the poster has no jobs", async () => {
		repository.findUserJobs.mockResolvedValue([]);
		const result = await service.getUserJobs({ posterUserId: params.posterUserId });
		expect(result).toMatchObject({ data: [], pagination: { hasMore: false, nextCursor: null } });
		expect(repository.findUserJobs).toHaveBeenCalledWith({
			posterUserId: params.posterUserId,
			cursor: undefined,
			limit: 21,
		});
	});

	it("returns active and archived posts with their list fields", async () => {
		repository.findUserJobs.mockResolvedValue([
			job,
			{
				...job,
				id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				status: JobStatus.ARCHIVED,
			},
		]);
		const result = await service.getUserJobs({ posterUserId: params.posterUserId });
		expect(result.data).toEqual([
			{
				jobId: job.id,
				title: job.title,
				descriptionSummary: job.descriptionSummary,
				payment: job.payment,
				location: { latitude: -23.55, longitude: -46.63, areaRadius: 2_000 },
				status: JobStatus.ACTIVE,
				createdAt: "2026-09-22T12:00:00.000Z",
				updatedAt: "2026-09-22T12:00:00.000Z",
			},
			expect.objectContaining({
				status: JobStatus.ARCHIVED,
				location: { latitude: -23.55, longitude: -46.63, areaRadius: 2_000 },
			}),
		]);
	});

	it("returns an archived job for its poster and keeps its public detail available", async () => {
		repository.archiveOwnedJob.mockResolvedValue({ ...job, status: JobStatus.ARCHIVED });
		repository.findPublicById.mockResolvedValue({ ...job, status: JobStatus.ARCHIVED });
		await expect(service.archiveJob({ jobId: job.id, posterUserId: params.posterUserId })).resolves.toMatchObject({
			status: "ARCHIVED",
		});
		await expect(service.getPublicJob({ jobId: job.id })).resolves.toMatchObject({ status: "ARCHIVED" });
	});

	it("returns 404 when a different poster archives a job", async () => {
		repository.archiveOwnedJob.mockResolvedValue(null);
		await expect(service.archiveJob({ jobId: job.id, posterUserId: "other" })).rejects.toThrow(JobNotFoundError);
	});

	it("refuses contact lookup for an archived job even when another active job shares its contact", async () => {
		repository.findActiveJobContact.mockResolvedValue(null);
		await expect(service.getJobContact({ jobId: job.id, contactId: job.contact.id })).rejects.toThrow(JobNotFoundError);
		expect(repository.findActiveJobContact).toHaveBeenCalledWith({ jobId: job.id, contactId: job.contact.id });
	});

	it("returns contact details for an active job's matching contact", async () => {
		repository.findActiveJobContact.mockResolvedValue({ contactMethod: "WHATSAPP", identifier: "+5511999999999" });
		await expect(service.getJobContact({ jobId: job.id, contactId: job.contact.id })).resolves.toEqual({
			contactMethod: "WHATSAPP",
			identifier: "+5511999999999",
		});
	});

	it("returns 20 jobs and a cursor after the last visible job when another page exists", async () => {
		const jobs = Array.from({ length: 21 }, (_, index) => ({
			...job,
			id: `bbbbbbbb-bbbb-4bbb-8bbb-${index.toString(16).padStart(12, "0")}`,
		}));
		repository.findUserJobs.mockResolvedValue(jobs);
		const result = await service.getUserJobs({ posterUserId: params.posterUserId });
		expect(result.data).toHaveLength(20);
		expect(result.pagination.hasMore).toBe(true);
		expect(decodeUserJobsCursor({ cursor: result.pagination.nextCursor! })).toEqual({
			version: 1,
			createdAt: "2026-09-22T12:00:00.000Z",
			jobId: jobs[19]?.id,
		});
	});

	it("decodes a cursor before querying and rejects malformed cursors", async () => {
		repository.findUserJobs.mockResolvedValue([]);
		const cursor = encodeUserJobsCursor({ createdAt: "2026-09-22T12:00:00.000Z", jobId: job.id });
		await service.getUserJobs({ posterUserId: params.posterUserId, cursor: cursor });
		expect(repository.findUserJobs).toHaveBeenCalledWith({
			posterUserId: params.posterUserId,
			cursor: { version: 1, createdAt: "2026-09-22T12:00:00.000Z", jobId: job.id },
			limit: 21,
		});
		await expect(service.getUserJobs({ posterUserId: params.posterUserId, cursor: "invalid" })).rejects.toThrow();
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
