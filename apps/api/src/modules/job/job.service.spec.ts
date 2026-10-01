import type { z } from "zod";
import type { FuzzyJobLocationOutputSchema } from "./schemas/fuzzy-job-location-output.schema";
import { MicroservicesAuthService } from "../auth/microservices-auth/microservices-auth.service";
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
	location: { title: "Rua Pardal Branco, 32", latitude: -23.55, longitude: -46.63 },
	contact: { method: "WHATSAPP" as const, identifier: "+5511999999999" },
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
		findUserJobById: vi.fn(),
		findByIdempotencyKey: vi.fn(),
		createJob: vi.fn(),
		findPublicById: vi.fn(),
		archiveOwnedJob: vi.fn(),
		activateOwnedJob: vi.fn(),
		findActiveJobContact: vi.fn(),
	};
	const imageAuth = { createGeoimageAccessToken: vi.fn() };
	const ai = { generateObject: vi.fn() };
	const users = { getOrAddContact: vi.fn() };
	const location = { fuzzCoordinate: vi.fn() };

	beforeEach(async () => {
		vi.resetAllMocks();
		imageAuth.createGeoimageAccessToken.mockResolvedValue("image-permission");
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
				{
					provide: MicroservicesAuthService,
					useValue: imageAuth,
				},
				JobService,
				{ provide: JobRepository, useValue: repository },
				{ provide: AiService, useValue: ai },
				{ provide: ContactService, useValue: users },
				{ provide: LocationService, useValue: location },
			],
		}).compile();
		service = module.get(JobService);
	});

	it.each(["create", "retry", "collision", "public", "owner", "archive", "activate", "list"])(
		"issues %s permissions only for persisted fuzzy coordinates",
		async (producer) => {
			imageAuth.createGeoimageAccessToken.mockResolvedValue("image-permission");
			const persisted = { ...job, fuzzyLatitude: new Prisma.Decimal(-23.6), fuzzyLongitude: new Prisma.Decimal(-46.7) };
			repository.createJob.mockResolvedValue(persisted);
			repository.findPublicById.mockResolvedValue(persisted);
			repository.findUserJobById.mockResolvedValue({ ...persisted, locationTitle: dto.location.title, contact: null });
			repository.archiveOwnedJob.mockResolvedValue(persisted);
			repository.activateOwnedJob.mockResolvedValue(persisted);
			repository.findUserJobs.mockResolvedValue([persisted, persisted]);
			if (producer === "retry" || producer === "collision") {
				const requestHash = (await import("node:crypto"))
					.createHash("sha256")
					.update(JSON.stringify(dto))
					.digest("hex");
				if (producer === "collision") {
					repository.findByIdempotencyKey.mockResolvedValueOnce(null);
					repository.createJob.mockRejectedValue(
						new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.9.1" }),
					);
				}
				repository.findByIdempotencyKey.mockResolvedValue({ job: persisted, requestHash: requestHash });
			}
			let locations: z.output<typeof FuzzyJobLocationOutputSchema>[];
			if (producer === "list") {
				locations = (await service.getUserJobs({ posterUserId: params.posterUserId })).data.map(
					(item) => item.location,
				);
			} else {
				const output =
					producer === "public"
						? await service.getPublicJob({ jobId: job.id })
						: producer === "owner"
							? await service.getUserJob({ jobId: job.id, posterUserId: params.posterUserId })
							: producer === "archive"
								? await service.archiveJob({ jobId: job.id, posterUserId: params.posterUserId })
								: producer === "activate"
									? await service.activateJob({ jobId: job.id, posterUserId: params.posterUserId })
									: await service.createJob(params);
				locations = [output.location];
			}
			expect({ locations: locations, signedCoordinates: imageAuth.createGeoimageAccessToken.mock.calls }).toEqual({
				locations: Array.from({ length: producer === "list" ? 2 : 1 }, () =>
					expect.objectContaining({ latitude: -23.6, longitude: -46.7, image: { accessToken: "image-permission" } }),
				),
				signedCoordinates: Array.from({ length: producer === "list" ? 2 : 1 }, () => [
					{ latitude: -23.6, longitude: -46.7 },
				]),
			});
		},
	);

	it.each([JobStatus.ACTIVE, JobStatus.ARCHIVED])(
		"returns the poster's %s job with fuzzy location and real contact",
		async (status) => {
			repository.findUserJobById.mockResolvedValue({
				...job,
				status: status,
				locationTitle: "Rua Pardal Branco, 32",
				contact: { contactMethod: "WHATSAPP", identifier: "+5511999999999" },
			});
			const result = await service.getUserJob({ jobId: job.id, posterUserId: params.posterUserId });
			expect(result).toEqual({
				jobId: job.id,
				description: job.description,
				contact: { method: "WHATSAPP", identifier: "+5511999999999" },
				location: {
					title: "Rua Pardal Branco, 32",
					latitude: -23.55,
					longitude: -46.63,
					areaRadius: 2_000,
					image: { accessToken: "image-permission" },
				},
				status: status,
				createdAt: "2026-09-22T12:00:00.000Z",
				updatedAt: "2026-09-22T12:00:00.000Z",
			});
			expect(repository.findUserJobById).toHaveBeenCalledWith({ jobId: job.id, posterUserId: params.posterUserId });
		},
	);

	it("returns the owned job with null contact after its linked contact was removed", async () => {
		repository.findUserJobById.mockResolvedValue({ ...job, locationTitle: "legacy-location-" + job.id, contact: null });
		await expect(service.getUserJob({ jobId: job.id, posterUserId: params.posterUserId })).resolves.toMatchObject({
			contact: null,
			location: { title: "legacy-location-" + job.id },
		});
	});

	it.each([
		{ scenario: "missing", jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", posterUserId: params.posterUserId },
		{ scenario: "another poster's", jobId: job.id, posterUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
	])("returns the same 404 for a $scenario job", async ({ jobId, posterUserId }) => {
		repository.findUserJobById.mockResolvedValue(null);
		await expect(service.getUserJob({ jobId: jobId, posterUserId: posterUserId })).rejects.toThrow(JobNotFoundError);
		expect(repository.findUserJobById).toHaveBeenCalledWith({ jobId: jobId, posterUserId: posterUserId });
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
				location: {
					latitude: -23.55,
					longitude: -46.63,
					areaRadius: 2_000,
					image: { accessToken: "image-permission" },
				},
				status: JobStatus.ACTIVE,
				createdAt: "2026-09-22T12:00:00.000Z",
				updatedAt: "2026-09-22T12:00:00.000Z",
			},
			expect.objectContaining({
				status: JobStatus.ARCHIVED,
				location: {
					latitude: -23.55,
					longitude: -46.63,
					areaRadius: 2_000,
					image: { accessToken: "image-permission" },
				},
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

	it("returns an active job with its original creation time after activation", async () => {
		repository.activateOwnedJob.mockResolvedValue({ ...job, status: JobStatus.ACTIVE });
		await expect(service.activateJob({ jobId: job.id, posterUserId: params.posterUserId })).resolves.toMatchObject({
			status: JobStatus.ACTIVE,
			createdAt: "2026-09-22T12:00:00.000Z",
		});
		expect(repository.activateOwnedJob).toHaveBeenCalledWith({ jobId: job.id, posterUserId: params.posterUserId });
	});

	it("returns the same 404 for a missing or unowned job during activation", async () => {
		repository.activateOwnedJob.mockResolvedValue(null);
		await expect(service.activateJob({ jobId: job.id, posterUserId: params.posterUserId })).rejects.toThrow(
			JobNotFoundError,
		);
		await expect(service.activateJob({ jobId: job.id, posterUserId: "other" })).rejects.toThrow(JobNotFoundError);
	});

	it("refuses contact lookup for an archived job even when another active job shares its contact", async () => {
		repository.findActiveJobContact.mockResolvedValue(null);
		await expect(service.getJobContact({ jobId: job.id, contactId: job.contact.id })).rejects.toThrow(JobNotFoundError);
		expect(repository.findActiveJobContact).toHaveBeenCalledWith({ jobId: job.id, contactId: job.contact.id });
	});

	it("returns contact details for an active job's matching contact", async () => {
		repository.findActiveJobContact.mockResolvedValue({ contactMethod: "WHATSAPP", identifier: "+5511999999999" });
		await expect(service.getJobContact({ jobId: job.id, contactId: job.contact.id })).resolves.toEqual({
			method: "WHATSAPP",
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

	it("rejects an idempotent retry whose selected location title changed", async () => {
		const requestHash = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		repository.findByIdempotencyKey.mockResolvedValue({ job: job, requestHash: requestHash });
		await expect(
			service.createJob({
				...params,
				dto: { ...dto, location: { ...dto.location, title: "Outra rua" } },
			}),
		).rejects.toBeInstanceOf(JobIdempotencyConflictError);
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
