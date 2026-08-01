import { JobContactMethod, JobStatus } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JobRepository } from "./job.repository";

describe("JobRepository lifecycle persistence", () => {
	let repository: JobRepository;
	let jobCreate: ReturnType<typeof vi.fn>;
	let jobFindUnique: ReturnType<typeof vi.fn>;
	let jobUpdate: ReturnType<typeof vi.fn>;
	let jobUpdateMany: ReturnType<typeof vi.fn>;
	let contactFindFirst: ReturnType<typeof vi.fn>;
	let executeRaw: ReturnType<typeof vi.fn>;
	let transaction: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		jobCreate = vi.fn().mockResolvedValue({});
		jobFindUnique = vi.fn().mockResolvedValue(null);
		jobUpdate = vi.fn().mockResolvedValue({});
		jobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
		contactFindFirst = vi.fn().mockResolvedValue(null);
		executeRaw = vi.fn().mockResolvedValue(1);
		transaction = vi.fn(
			(callback: (tx: { job: { update: typeof jobUpdate }; $executeRaw: typeof executeRaw }) => Promise<void>) =>
				callback({ job: { update: jobUpdate }, $executeRaw: executeRaw }),
		);
		repository = new JobRepository({
			job: {
				create: jobCreate,
				findUnique: jobFindUnique,
				update: jobUpdate,
				updateMany: jobUpdateMany,
			},
			jobContact: {
				findFirst: contactFindFirst,
			},
			$transaction: transaction,
		} as unknown as PrismaService);
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
		});

		expect(jobCreate).toHaveBeenCalledWith({
			data: {
				description: "Descrição original.",
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

	it("should upsert contact changes inside the job update transaction", async () => {
		await repository.update({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			data: { title: "Novo título" },
			contact: {
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			},
		});

		expect(jobUpdate).toHaveBeenCalledWith({
			where: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
			data: {
				title: "Novo título",
				contact: {
					upsert: {
						create: {
							contactMethod: JobContactMethod.WHATSAPP,
							identifier: "+5511999999999",
						},
						update: {
							contactMethod: JobContactMethod.WHATSAPP,
							identifier: "+5511999999999",
						},
					},
				},
			},
		});
	});

	it("should update the real PostGIS point when location changes", async () => {
		await repository.update({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			data: { city: "São Paulo" },
			locationPoint: { latitude: -23.55, longitude: -46.63 },
		});

		expect(executeRaw).toHaveBeenCalledOnce();
	});

	it("should avoid a PostGIS update when location is unchanged", async () => {
		await repository.update({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			data: { title: "Novo título" },
		});

		expect(executeRaw).not.toHaveBeenCalled();
	});

	it("should atomically change only a DRAFT row to ACTIVE", async () => {
		await repository.publishDraft({
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(jobUpdate).toHaveBeenCalledWith({
			where: {
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				status: JobStatus.DRAFT,
			},
			data: { status: JobStatus.ACTIVE },
			include: { contact: true },
		});
	});

	it("should exclude draft jobs from contact lookup", async () => {
		await repository.findContactByIdAndJobId({
			contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});

		expect(contactFindFirst).toHaveBeenCalledWith({
			where: {
				id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				job: {
					status: { not: JobStatus.DRAFT },
				},
			},
		});
	});
});
