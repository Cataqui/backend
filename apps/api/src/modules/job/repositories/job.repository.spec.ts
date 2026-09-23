import { Test } from "@nestjs/testing";
import { Prisma, JobStatus } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JobRepository } from "./job.repository";

const row = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: "Ajudante",
	description: "Ajudar com caixas",
	descriptionSummary: "Hoje à tarde",
	contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	contactMethod: "WHATSAPP",
	fuzzyLatitude: new Prisma.Decimal(-23),
	fuzzyLongitude: new Prisma.Decimal(-46),
	payment: "R$ 100",
	status: JobStatus.ACTIVE,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("JobRepository", () => {
	const prisma = {
		$queryRaw: vi.fn(),
		$transaction: vi.fn(),
		job: { findMany: vi.fn() },
		jobPostRequest: { findUnique: vi.fn() },
	};
	let repository: JobRepository;
	beforeEach(async () => {
		vi.resetAllMocks();
		const module = await Test.createTestingModule({
			providers: [JobRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();
		repository = module.get(JobRepository);
	});

	it("lists only the authenticated poster's active and closed jobs newest first", async () => {
		prisma.job.findMany.mockResolvedValue([
			{ ...row, status: JobStatus.ACTIVE },
			{ ...row, status: JobStatus.CLOSED },
		]);
		const results = await repository.findUserJobs({ posterUserId: "poster", limit: 21 });
		expect(results.map((job) => job.status)).toEqual([JobStatus.ACTIVE, JobStatus.CLOSED]);
		expect(prisma.job.findMany).toHaveBeenCalledWith({
			where: { posterUserId: "poster" },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: 21,
			select: {
				id: true,
				title: true,
				descriptionSummary: true,
				payment: true,
				fuzzyLatitude: true,
				fuzzyLongitude: true,
				status: true,
				createdAt: true,
				updatedAt: true,
			},
		});
	});

	it("continues after equal timestamps using the job ID tie breaker", async () => {
		prisma.job.findMany.mockResolvedValue([]);
		const createdAt = "2026-09-23T12:00:00.000Z";
		await repository.findUserJobs({
			posterUserId: "poster",
			cursor: { version: 1, createdAt: createdAt, jobId: row.id },
			limit: 21,
		});
		expect(prisma.job.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					posterUserId: "poster",
					OR: [{ createdAt: { lt: new Date(createdAt) } }, { createdAt: new Date(createdAt), id: { lt: row.id } }],
				},
			}),
		);
	});

	it("reads a public post with string payment", async () => {
		prisma.$queryRaw.mockResolvedValue([row]);
		const result = await repository.findPublicById({ jobId: row.id });
		expect(result).toMatchObject({ id: row.id, payment: "R$ 100", contact: { id: row.contactId } });
	});

	it("reads a public post with null payment", async () => {
		prisma.$queryRaw.mockResolvedValue([{ ...row, payment: null }]);
		expect((await repository.findPublicById({ jobId: row.id }))?.payment).toBeNull();
	});

	it("finds an existing post by poster and idempotency key", async () => {
		await repository.findByIdempotencyKey({ posterUserId: "poster", idempotencyKey: "key" });
		expect(prisma.jobPostRequest.findUnique).toHaveBeenCalledWith({
			where: { posterUserId_idempotencyKey: { posterUserId: "poster", idempotencyKey: "key" } },
			include: { job: { include: { contact: true } } },
		});
	});

	it("creates the post, exact location, and idempotency record in one transaction", async () => {
		const create = vi.fn().mockResolvedValue(row);
		const createPostRequest = vi.fn().mockResolvedValue({ id: "request" });
		const execute = vi.fn().mockResolvedValue(1);
		prisma.$transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) =>
			callback({ job: { create: create }, jobPostRequest: { create: createPostRequest }, $executeRaw: execute }),
		);
		const result = await repository.createJob({
			posterUserId: "poster",
			idempotencyKey: "key",
			requestHash: "a".repeat(64),
			contactId: row.contactId,
			description: row.description,
			payment: row.payment,
			title: row.title,
			descriptionSummary: row.descriptionSummary,
			location: { latitude: -23, longitude: -46 },
			fuzzyLocation: { latitude: -23.1, longitude: -46.1 },
		});
		expect(result.id).toBe(row.id);
		expect(create).toHaveBeenCalledWith({
			data: expect.objectContaining({ payment: "R$ 100", status: JobStatus.ACTIVE, fuzzyLatitude: -23.1 }),
			include: { contact: true },
		});
		expect(execute).toHaveBeenCalledOnce();
		expect(createPostRequest).toHaveBeenCalledWith({
			data: {
				posterUserId: "poster",
				idempotencyKey: "key",
				requestHash: "a".repeat(64),
				jobId: row.id,
			},
		});
	});

	it("persists null payment in the job transaction", async () => {
		const create = vi.fn().mockResolvedValue({ ...row, payment: null });
		prisma.$transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) =>
			callback({
				job: { create: create },
				jobPostRequest: { create: vi.fn() },
				$executeRaw: vi.fn(),
			}),
		);
		await repository.createJob({
			posterUserId: "poster",
			idempotencyKey: "key",
			requestHash: "a".repeat(64),
			contactId: row.contactId,
			description: row.description,
			payment: null,
			title: row.title,
			descriptionSummary: row.descriptionSummary,
			location: { latitude: -23, longitude: -46 },
			fuzzyLocation: { latitude: -23.1, longitude: -46.1 },
		});
		expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payment: null }) }));
	});
});
