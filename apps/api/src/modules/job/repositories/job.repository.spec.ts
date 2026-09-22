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
		jobPostRequest: { findUnique: vi.fn() },
		jobContact: { findFirst: vi.fn() },
	};
	let repository: JobRepository;
	beforeEach(async () => {
		vi.resetAllMocks();
		const module = await Test.createTestingModule({
			providers: [JobRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();
		repository = module.get(JobRepository);
	});

	it("reads a public post with string payment", async () => {
		prisma.$queryRaw.mockResolvedValue([row]);
		const result = await repository.findPublicById({ jobId: row.id });
		expect(result).toMatchObject({ id: row.id, payment: "R$ 100", contact: { id: row.contactId } });
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
});
