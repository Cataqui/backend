import { JobStatus } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JobRepository } from "./job.repository";

describe("JobRepository lifecycle persistence", () => {
	let repository: JobRepository;
	let jobCreate: ReturnType<typeof vi.fn>;
	let jobFindUnique: ReturnType<typeof vi.fn>;
	let jobFindFirst: ReturnType<typeof vi.fn>;
	let jobUpdate: ReturnType<typeof vi.fn>;
	let jobUpdateMany: ReturnType<typeof vi.fn>;
	let executeRaw: ReturnType<typeof vi.fn>;
	let transaction: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		jobCreate = vi.fn().mockResolvedValue({});
		jobFindUnique = vi.fn().mockResolvedValue(null);
		jobFindFirst = vi.fn().mockResolvedValue(null);
		jobUpdate = vi.fn().mockResolvedValue({});
		jobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
		executeRaw = vi.fn().mockResolvedValue(1);
		transaction = vi.fn(
			(callback: (tx: { job: { update: typeof jobUpdate }; $executeRaw: typeof executeRaw }) => Promise<void>) =>
				callback({ job: { update: jobUpdate }, $executeRaw: executeRaw }),
		);
		repository = new JobRepository({
			job: {
				create: jobCreate,
				findFirst: jobFindFirst,
				findUnique: jobFindUnique,
				update: jobUpdate,
				updateMany: jobUpdateMany,
			},
			$transaction: transaction,
		} as unknown as PrismaService);
	});

	it("should exclude draft jobs from public job lookup", async () => {
		await repository.findPublicById({ jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });

		expect(jobFindFirst).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				status: { not: JobStatus.DRAFT },
			},
			include: { contact: true },
		});
	});

	it("should find a contact only through the active job that references it", async () => {
		await repository.findActiveJobContact({
			contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(jobFindFirst).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				status: JobStatus.ACTIVE,
			},
			select: { contact: true },
		});
	});

	it("should return the contact selected by an active job", async () => {
		const contact = {
			id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			contactMethod: "WHATSAPP",
			identifier: "@cataqui.poster",
			createdAt: new Date("2026-08-09T12:00:00.000Z"),
		};
		jobFindFirst.mockResolvedValue({ contact: contact });

		const result = await repository.findActiveJobContact({
			contactId: contact.id,
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(result).toBe(contact);
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
