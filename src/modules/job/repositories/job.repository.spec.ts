import {
	JobContactMethod,
	JobPaymentAmountPeriod,
	JobPaymentType,
	JobStatus,
	JobType,
	Prisma,
} from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JobRepository } from "./job.repository";

function _createPublicJobDatabaseRow() {
	return {
		id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		title: "Auxiliar de evento",
		description: "Ajude na organização de um evento local.",
		descriptionSummary: "Trabalho rápido em evento no centro.",
		contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		contactMethod: JobContactMethod.WHATSAPP,
		neighborhood: "Centro",
		city: "São Paulo",
		state: "SP",
		country: "BR",
		fuzzyLatitude: new Prisma.Decimal("-23.550000"),
		fuzzyLongitude: new Prisma.Decimal("-46.630000"),
		paymentType: JobPaymentType.FIXED,
		paymentMinAmount: new Prisma.Decimal("150.00"),
		paymentMaxAmount: null,
		paymentNote: null,
		paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE,
		paymentCurrency: "BRL",
		status: JobStatus.ACTIVE,
		type: JobType.INDIVIDUAL,
		createdAt: new Date("2026-08-10T12:00:00.000Z"),
		updatedAt: new Date("2026-08-10T12:30:00.000Z"),
	};
}

describe("JobRepository lifecycle persistence", () => {
	let repository: JobRepository;
	let queryRaw: ReturnType<typeof vi.fn>;
	let jobCreate: ReturnType<typeof vi.fn>;
	let jobFindUnique: ReturnType<typeof vi.fn>;
	let jobFindFirst: ReturnType<typeof vi.fn>;
	let jobContactFindFirst: ReturnType<typeof vi.fn>;
	let jobUpdate: ReturnType<typeof vi.fn>;
	let jobUpdateMany: ReturnType<typeof vi.fn>;
	let executeRaw: ReturnType<typeof vi.fn>;
	let transaction: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		queryRaw = vi.fn().mockResolvedValue([]);
		jobCreate = vi.fn().mockResolvedValue({});
		jobFindUnique = vi.fn().mockResolvedValue(null);
		jobFindFirst = vi.fn().mockResolvedValue(null);
		jobContactFindFirst = vi.fn().mockResolvedValue(null);
		jobUpdate = vi.fn().mockResolvedValue({});
		jobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
		executeRaw = vi.fn().mockResolvedValue(1);
		transaction = vi.fn(
			(callback: (tx: { job: { update: typeof jobUpdate }; $executeRaw: typeof executeRaw }) => Promise<void>) =>
				callback({ job: { update: jobUpdate }, $executeRaw: executeRaw }),
		);
		repository = new JobRepository({
			$queryRaw: queryRaw,
			job: {
				create: jobCreate,
				findFirst: jobFindFirst,
				findUnique: jobFindUnique,
				update: jobUpdate,
				updateMany: jobUpdateMany,
			},
			jobContact: {
				findFirst: jobContactFindFirst,
			},
			$transaction: transaction,
		} as unknown as PrismaService);
	});

	it("should execute one parameterized query that excludes draft jobs from public lookup", async () => {
		await repository.findPublicById({ jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });

		expect(queryRaw).toHaveBeenCalledTimes(1);
		expect(jobFindFirst).not.toHaveBeenCalled();

		const query: unknown = queryRaw.mock.calls[0]?.[0];
		expect(query).toBeInstanceOf(Prisma.Sql);
		if (!(query instanceof Prisma.Sql)) throw new Error("Expected public job lookup to use parameterized Prisma SQL");

		expect(query.text).toContain('LEFT JOIN "public"."job_contact_methods"');
		expect(query.text).toContain('job."status" <> ');
		expect(query.text).not.toContain("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
		expect(query.text).not.toContain(JobStatus.DRAFT);
		expect(query.values).toEqual(["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", JobStatus.DRAFT]);
	});

	it("should map the one-query database row to the exact public job shape", async () => {
		const databaseJob = _createPublicJobDatabaseRow();
		queryRaw.mockResolvedValue([databaseJob]);

		const result = await repository.findPublicById({ jobId: databaseJob.id });

		expect(result).toEqual({
			id: databaseJob.id,
			title: databaseJob.title,
			description: databaseJob.description,
			descriptionSummary: databaseJob.descriptionSummary,
			contact: {
				id: databaseJob.contactId,
				contactMethod: databaseJob.contactMethod,
			},
			neighborhood: databaseJob.neighborhood,
			city: databaseJob.city,
			state: databaseJob.state,
			country: databaseJob.country,
			fuzzyLatitude: databaseJob.fuzzyLatitude,
			fuzzyLongitude: databaseJob.fuzzyLongitude,
			paymentType: databaseJob.paymentType,
			paymentMinAmount: databaseJob.paymentMinAmount,
			paymentMaxAmount: databaseJob.paymentMaxAmount,
			paymentNote: databaseJob.paymentNote,
			paymentAmountPeriod: databaseJob.paymentAmountPeriod,
			paymentCurrency: databaseJob.paymentCurrency,
			status: databaseJob.status,
			type: databaseJob.type,
			createdAt: databaseJob.createdAt,
			updatedAt: databaseJob.updatedAt,
		});
	});

	it("should map a database row without a joined contact to null", async () => {
		const databaseJob = { ..._createPublicJobDatabaseRow(), contactId: null, contactMethod: null };
		queryRaw.mockResolvedValue([databaseJob]);

		const result = await repository.findPublicById({ jobId: databaseJob.id });

		expect(result?.contact).toBeNull();
	});

	it("should return null when the public job query finds no row", async () => {
		queryRaw.mockResolvedValue([]);

		const result = await repository.findPublicById({ jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });

		expect(result).toBeNull();
	});

	it("should find a contact only through the active job that references it", async () => {
		await repository.findActiveJobContact({
			contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(jobContactFindFirst).toHaveBeenCalledWith({
			where: {
				id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				jobs: {
					some: {
						id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
						status: JobStatus.ACTIVE,
					},
				},
			},
			select: {
				contactMethod: true,
				identifier: true,
			},
		});
	});

	it("should return the contact selected by an active job", async () => {
		const selectedContact = {
			contactMethod: "WHATSAPP",
			identifier: "@cataqui.poster",
		};
		jobContactFindFirst.mockResolvedValue(selectedContact);

		const result = await repository.findActiveJobContact({
			contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(result).toBe(selectedContact);
	});

	it("should scope poster job lookup to the authenticated user", async () => {
		await repository.findByIdFromPoster({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		});

		expect(jobFindFirst).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			},
			include: { contact: true },
		});
	});

	it("should find an owned draft only when its status is DRAFT", async () => {
		await repository.findDraftByIdFromPoster({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		});

		expect(jobFindFirst).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
				status: JobStatus.DRAFT,
			},
			include: { contact: true },
		});
	});

	it("should find an owned public job only when its status is not DRAFT", async () => {
		await repository.findPublicByIdFromPoster({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		});

		expect(jobFindFirst).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
				status: { not: JobStatus.DRAFT },
			},
			include: { contact: true },
		});
	});

	it("should return null when a job lookup finds nothing", async () => {
		const result = await repository.findById({ jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });

		expect(result).toBeNull();
	});

	it("should load a job and its contact by ID", async () => {
		await repository.findById({ jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });

		expect(jobFindUnique).toHaveBeenCalledWith({
			where: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
			include: { contact: true },
		});
	});

	it("should create drafts in the jobs table with DRAFT status", async () => {
		await repository.createDraft({
			description: "Descrição original.",
			posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		});

		expect(jobCreate).toHaveBeenCalledWith({
			data: {
				description: "Descrição original.",
				posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
				status: JobStatus.DRAFT,
				descriptionSummary: null,
				title: null,
				type: null,
				paymentType: null,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: null,
				paymentCurrency: null,
			},
			include: { contact: true },
		});
	});

	it("should update derived job data only for the description used as AI input", async () => {
		await repository.updateDerivedJobDataIfDescriptionUnchanged({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			description: "Descrição original.",
			title: "Título gerado",
			descriptionSummary: "Resumo gerado.",
		});

		expect(jobUpdateMany).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				description: "Descrição original.",
			},
			data: {
				title: "Título gerado",
				descriptionSummary: "Resumo gerado.",
			},
		});
	});

	it("should connect the job to an immutable contact by ID", async () => {
		await repository.update({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			data: {
				title: "Novo título",
				contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			},
		});

		expect(jobUpdate).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			},
			data: {
				title: "Novo título",
				contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			},
			include: { contact: true },
		});
	});

	it("should update the real PostGIS point when location changes", async () => {
		await repository.update({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			data: { city: "São Paulo" },
			locationPoint: { latitude: -23.55, longitude: -46.63 },
		});

		expect(executeRaw).toHaveBeenCalledOnce();
	});

	it("should avoid a PostGIS update when location is unchanged", async () => {
		await repository.update({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			data: { title: "Novo título" },
		});

		expect(executeRaw).not.toHaveBeenCalled();
	});

	it("should atomically change only a DRAFT row to ACTIVE", async () => {
		await repository.publishDraft({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		});

		expect(jobUpdate).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
				status: JobStatus.DRAFT,
			},
			data: { status: JobStatus.ACTIVE },
			include: { contact: true },
		});
	});
});
