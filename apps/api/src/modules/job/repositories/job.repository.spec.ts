import { Test } from "@nestjs/testing";
import * as td from "testdouble";
import { Prisma, JobStatus, ContactMethod } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { FeedRepository } from "../../feed/repositories/feed.repository";
import { JobRepository } from "./job.repository";

const row: Awaited<ReturnType<JobRepository["createJob"]>> & {
	contactMethod: ContactMethod;
	contactId: string;
	locationImageUrl: string;
} = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	posterProfileId: "poster",
	locationTitle: "Rua Pardal Branco, 32",
	contact: {
		id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		ownerProfileId: "poster",
		contactMethod: ContactMethod.WHATSAPP,
		identifier: "+5511999999999",
		createdAt: new Date("2026-09-23T12:00:00.000Z"),
	},
	title: "Ajudante",
	description: "Ajudar com caixas",
	descriptionSummary: "Hoje à tarde",
	contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	contactMethod: ContactMethod.WHATSAPP,
	fuzzyLatitude: new Prisma.Decimal(-23),
	fuzzyLongitude: new Prisma.Decimal(-46),
	locationImageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
	payment: "R$ 100",
	status: JobStatus.ACTIVE,
	createdAt: new Date(),
	updatedAt: new Date(),
};

afterEach(() => td.reset());

describe("JobRepository", () => {
	let prisma: PrismaService;
	let repository: JobRepository;
	beforeEach(async () => {
		prisma = td.object<PrismaService>();
		Object.defineProperty(prisma, "job", { value: td.object<PrismaService["job"]>() });
		Object.defineProperty(prisma, "contact", { value: td.object<PrismaService["contact"]>() });
		Object.defineProperty(prisma, "jobPostRequest", { value: td.object<PrismaService["jobPostRequest"]>() });
		const module = await Test.createTestingModule({
			providers: [JobRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();
		repository = module.get(JobRepository);
	});

	it("returns the authenticated poster's active and archived jobs", async () => {
		td.when(prisma.job.findMany(td.matchers.anything())).thenResolve([
			{ ...row, status: JobStatus.ACTIVE },
			{ ...row, status: JobStatus.ARCHIVED },
		]);
		const results = await repository.findProfileJobs({ posterProfileId: "poster", limit: 21 });
		expect(results.map((job) => job.status)).toEqual([JobStatus.ACTIVE, JobStatus.ARCHIVED]);
	});

	it("selects only the authenticated poster's jobs newest first", async () => {
		td.when(prisma.job.findMany(td.matchers.anything())).thenResolve([
			{ ...row, status: JobStatus.ACTIVE },
			{ ...row, status: JobStatus.ARCHIVED },
		]);
		await repository.findProfileJobs({ posterProfileId: "poster", limit: 21 });
		expect(td.explain(prisma.job.findMany).calls.map((call) => call.args)).toContainEqual([
			{
				where: { posterProfileId: "poster" },
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				take: 21,
				select: {
					id: true,
					title: true,
					descriptionSummary: true,
					payment: true,
					fuzzyLatitude: true,
					fuzzyLongitude: true,
					locationImageUrl: true,
					status: true,
					createdAt: true,
					updatedAt: true,
				},
			},
		]);
	});

	it("selects an owned job by both job ID and poster including its location title and real contact", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(null);
		await repository.findProfileJobById({ jobId: row.id, posterProfileId: "poster" });
		expect(td.explain(prisma.job.findFirst).calls.map((call) => call.args)).toContainEqual([
			{
				where: { id: row.id, posterProfileId: "poster" },
				select: {
					id: true,
					description: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					locationTitle: true,
					contact: { select: { contactMethod: true, identifier: true } },
					fuzzyLatitude: true,
					fuzzyLongitude: true,
					locationImageUrl: true,
				},
			},
		]);
	});

	it("continues after equal timestamps using the job ID tie breaker", async () => {
		td.when(prisma.job.findMany(td.matchers.anything())).thenResolve([]);
		const createdAt = "2026-09-23T12:00:00.000Z";
		await repository.findProfileJobs({
			posterProfileId: "poster",
			cursor: { version: 1, createdAt: createdAt, jobId: row.id },
			limit: 21,
		});
		expect(td.explain(prisma.job.findMany).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({
				where: {
					posterProfileId: "poster",
					OR: [{ createdAt: { lt: new Date(createdAt) } }, { createdAt: new Date(createdAt), id: { lt: row.id } }],
				},
			}),
		]);
	});

	it("reads a public post with string payment", async () => {
		td.when(prisma.$queryRaw<(typeof row)[]>(td.matchers.anything())).thenResolve([row]);
		const result = await repository.findPublicById({ jobId: row.id });
		expect(result).toMatchObject({ id: row.id, payment: "R$ 100", contact: { id: row.contactId } });
	});

	it("reads a public post with null payment", async () => {
		td.when(prisma.$queryRaw<(typeof row)[]>(td.matchers.anything())).thenResolve([{ ...row, payment: null }]);
		expect((await repository.findPublicById({ jobId: row.id }))?.payment).toBeNull();
	});

	it("returns the archived state after archiving an owned job", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve({ ...row, status: JobStatus.ARCHIVED });
		const result = await repository.archiveOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(result?.status).toBe(JobStatus.ARCHIVED);
	});

	it("archives only an active job belonging to the poster", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve({ ...row, status: JobStatus.ARCHIVED });
		await repository.archiveOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(td.explain(prisma.job.updateMany).calls.map((call) => call.args)).toContainEqual([
			{
				where: { id: row.id, posterProfileId: "poster", status: JobStatus.ACTIVE },
				data: { status: JobStatus.ARCHIVED },
			},
		]);
	});

	it("reads the owned job after archiving it", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve({ ...row, status: JobStatus.ARCHIVED });
		await repository.archiveOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(td.explain(prisma.job.findFirst).calls.map((call) => call.args)).toContainEqual([
			{
				where: { id: row.id, posterProfileId: "poster" },
				select: expect.objectContaining({ status: true, contact: { select: { id: true, contactMethod: true } } }),
			},
		]);
	});

	it("returns the current archived job when it is archived again", async () => {
		const archived = { ...row, status: JobStatus.ARCHIVED };
		td.when(prisma.job.updateMany(td.matchers.anything())).thenResolve({ count: 0 });
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(archived);
		await expect(repository.archiveOwnedJob({ jobId: row.id, posterProfileId: "poster" })).resolves.toBe(archived);
	});

	it("updates only active jobs when archiving an already archived job", async () => {
		const archived = { ...row, status: JobStatus.ARCHIVED };
		td.when(prisma.job.updateMany(td.matchers.anything())).thenResolve({ count: 0 });
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(archived);
		await repository.archiveOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(td.explain(prisma.job.updateMany).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ where: expect.objectContaining({ status: JobStatus.ACTIVE }) }),
		]);
	});

	it("returns no job when its poster does not own it", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(null);
		await expect(repository.archiveOwnedJob({ jobId: row.id, posterProfileId: "other" })).resolves.toBeNull();
	});

	it("preserves the creation time when returning an activated job", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(row);
		const result = await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(result).toMatchObject({ status: JobStatus.ACTIVE, createdAt: row.createdAt });
	});

	it("activates only an archived job belonging to the poster", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(row);
		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(td.explain(prisma.job.updateMany).calls.map((call) => call.args)).toContainEqual([
			{
				where: { id: row.id, posterProfileId: "poster", status: JobStatus.ARCHIVED },
				data: { status: JobStatus.ACTIVE },
			},
		]);
	});

	it("reads the owned job after activating it", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(row);
		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(td.explain(prisma.job.findFirst).calls.map((call) => call.args)).toContainEqual([
			{
				where: { id: row.id, posterProfileId: "poster" },
				select: expect.objectContaining({
					status: true,
					createdAt: true,
					contact: { select: { id: true, contactMethod: true } },
				}),
			},
		]);
	});

	it("returns the current active job when it is activated again", async () => {
		td.when(prisma.job.updateMany(td.matchers.anything())).thenResolve({ count: 0 });
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(row);
		await expect(repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" })).resolves.toBe(row);
	});

	it("updates only archived jobs when activating an already active job", async () => {
		td.when(prisma.job.updateMany(td.matchers.anything())).thenResolve({ count: 0 });
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(row);
		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(td.explain(prisma.job.updateMany).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ where: expect.objectContaining({ status: JobStatus.ARCHIVED }) }),
		]);
	});

	it("returns no job when activation is requested by another poster", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(null);
		await expect(repository.activateOwnedJob({ jobId: row.id, posterProfileId: "other" })).resolves.toBeNull();
	});

	it("restricts activation updates to the authenticated poster", async () => {
		td.when(prisma.job.findFirst(td.matchers.anything())).thenResolve(null);
		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "other" });
		expect(td.explain(prisma.job.updateMany).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ where: expect.objectContaining({ posterProfileId: "other" }) }),
		]);
	});

	it("excludes an archived job from the feed before activation", async () => {
		const state: { status: JobStatus } = { status: JobStatus.ARCHIVED };
		td.when(prisma.job.updateMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobUpdateManyArgs): Promise<Prisma.BatchPayload> => {
				if (where?.posterProfileId !== "poster" || where?.status !== state.status) return { count: 0 };
				state.status = JobStatus.ACTIVE;
				return { count: 1 };
			},
		);
		td.when(prisma.job.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<typeof row> => ({ ...row, status: state.status }),
		);
		td.when(prisma.job.findMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobFindManyArgs): Promise<(typeof row)[]> =>
				where?.status === state.status ? [row] : [],
		);
		td.when(prisma.contact.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<Awaited<ReturnType<JobRepository["findActiveJobContact"]>>> =>
				state.status === JobStatus.ACTIVE ? { contactMethod: "WHATSAPP", identifier: "+5511999999999" } : null,
		);

		const feed = new FeedRepository(prisma);
		expect(await feed.getFeedItems({ limit: 20 })).toEqual([]);
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });

		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		await feed.getFeedItems({ limit: 20 });
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });
	});

	it("hides an archived job's contact before activation", async () => {
		const state: { status: JobStatus } = { status: JobStatus.ARCHIVED };
		td.when(prisma.job.updateMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobUpdateManyArgs): Promise<Prisma.BatchPayload> => {
				if (where?.posterProfileId !== "poster" || where?.status !== state.status) return { count: 0 };
				state.status = JobStatus.ACTIVE;
				return { count: 1 };
			},
		);
		td.when(prisma.job.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<typeof row> => ({ ...row, status: state.status }),
		);
		td.when(prisma.job.findMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobFindManyArgs): Promise<(typeof row)[]> =>
				where?.status === state.status ? [row] : [],
		);
		td.when(prisma.contact.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<Awaited<ReturnType<JobRepository["findActiveJobContact"]>>> =>
				state.status === JobStatus.ACTIVE ? { contactMethod: "WHATSAPP", identifier: "+5511999999999" } : null,
		);

		const feed = new FeedRepository(prisma);
		await feed.getFeedItems({ limit: 20 });
		expect(await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId })).toBeNull();

		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		await feed.getFeedItems({ limit: 20 });
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });
	});

	it("returns an activated job to the public feed", async () => {
		const state: { status: JobStatus } = { status: JobStatus.ARCHIVED };
		td.when(prisma.job.updateMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobUpdateManyArgs): Promise<Prisma.BatchPayload> => {
				if (where?.posterProfileId !== "poster" || where?.status !== state.status) return { count: 0 };
				state.status = JobStatus.ACTIVE;
				return { count: 1 };
			},
		);
		td.when(prisma.job.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<typeof row> => ({ ...row, status: state.status }),
		);
		td.when(prisma.job.findMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobFindManyArgs): Promise<(typeof row)[]> =>
				where?.status === state.status ? [row] : [],
		);
		td.when(prisma.contact.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<Awaited<ReturnType<JobRepository["findActiveJobContact"]>>> =>
				state.status === JobStatus.ACTIVE ? { contactMethod: "WHATSAPP", identifier: "+5511999999999" } : null,
		);

		const feed = new FeedRepository(prisma);
		await feed.getFeedItems({ limit: 20 });
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });

		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		expect(await feed.getFeedItems({ limit: 20 })).toEqual([row]);
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });
	});

	it("reveals an activated job's contact", async () => {
		const state: { status: JobStatus } = { status: JobStatus.ARCHIVED };
		td.when(prisma.job.updateMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobUpdateManyArgs): Promise<Prisma.BatchPayload> => {
				if (where?.posterProfileId !== "poster" || where?.status !== state.status) return { count: 0 };
				state.status = JobStatus.ACTIVE;
				return { count: 1 };
			},
		);
		td.when(prisma.job.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<typeof row> => ({ ...row, status: state.status }),
		);
		td.when(prisma.job.findMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobFindManyArgs): Promise<(typeof row)[]> =>
				where?.status === state.status ? [row] : [],
		);
		td.when(prisma.contact.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<Awaited<ReturnType<JobRepository["findActiveJobContact"]>>> =>
				state.status === JobStatus.ACTIVE ? { contactMethod: "WHATSAPP", identifier: "+5511999999999" } : null,
		);

		const feed = new FeedRepository(prisma);
		await feed.getFeedItems({ limit: 20 });
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });

		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		await feed.getFeedItems({ limit: 20 });
		expect(await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId })).toEqual({
			contactMethod: "WHATSAPP",
			identifier: "+5511999999999",
		});
	});

	it("restricts feed results to active jobs after activation", async () => {
		const state: { status: JobStatus } = { status: JobStatus.ARCHIVED };
		td.when(prisma.job.updateMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobUpdateManyArgs): Promise<Prisma.BatchPayload> => {
				if (where?.posterProfileId !== "poster" || where?.status !== state.status) return { count: 0 };
				state.status = JobStatus.ACTIVE;
				return { count: 1 };
			},
		);
		td.when(prisma.job.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<typeof row> => ({ ...row, status: state.status }),
		);
		td.when(prisma.job.findMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobFindManyArgs): Promise<(typeof row)[]> =>
				where?.status === state.status ? [row] : [],
		);
		td.when(prisma.contact.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<Awaited<ReturnType<JobRepository["findActiveJobContact"]>>> =>
				state.status === JobStatus.ACTIVE ? { contactMethod: "WHATSAPP", identifier: "+5511999999999" } : null,
		);

		const feed = new FeedRepository(prisma);
		await feed.getFeedItems({ limit: 20 });
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });

		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		await feed.getFeedItems({ limit: 20 });
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });
		expect(td.explain(prisma.job.findMany).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ where: { status: JobStatus.ACTIVE } }),
		]);
	});

	it("restricts revealed contacts to the requested active job after activation", async () => {
		const state: { status: JobStatus } = { status: JobStatus.ARCHIVED };
		td.when(prisma.job.updateMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobUpdateManyArgs): Promise<Prisma.BatchPayload> => {
				if (where?.posterProfileId !== "poster" || where?.status !== state.status) return { count: 0 };
				state.status = JobStatus.ACTIVE;
				return { count: 1 };
			},
		);
		td.when(prisma.job.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<typeof row> => ({ ...row, status: state.status }),
		);
		td.when(prisma.job.findMany(td.matchers.anything())).thenDo(
			async ({ where }: Prisma.JobFindManyArgs): Promise<(typeof row)[]> =>
				where?.status === state.status ? [row] : [],
		);
		td.when(prisma.contact.findFirst(td.matchers.anything())).thenDo(
			async (): Promise<Awaited<ReturnType<JobRepository["findActiveJobContact"]>>> =>
				state.status === JobStatus.ACTIVE ? { contactMethod: "WHATSAPP", identifier: "+5511999999999" } : null,
		);

		const feed = new FeedRepository(prisma);
		await feed.getFeedItems({ limit: 20 });
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });

		await repository.activateOwnedJob({ jobId: row.id, posterProfileId: "poster" });
		await feed.getFeedItems({ limit: 20 });
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });
		expect(td.explain(prisma.contact.findFirst).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({
				where: expect.objectContaining({ jobs: { some: { id: row.id, status: JobStatus.ACTIVE } } }),
			}),
		]);
	});

	it("reveals a shared contact only through the requested active job", async () => {
		td.when(prisma.contact.findFirst(td.matchers.anything())).thenResolve({
			contactMethod: "WHATSAPP",
			identifier: "+5511999999999",
		});
		await repository.findActiveJobContact({ jobId: row.id, contactId: row.contactId });
		expect(td.explain(prisma.contact.findFirst).calls.map((call) => call.args)).toContainEqual([
			{
				where: { id: row.contactId, jobs: { some: { id: row.id, status: JobStatus.ACTIVE } } },
				select: { contactMethod: true, identifier: true },
			},
		]);
	});

	it("finds an existing post by poster and idempotency key", async () => {
		await repository.findByIdempotencyKey({ posterProfileId: "poster", idempotencyKey: "key" });
		expect(td.explain(prisma.jobPostRequest.findUnique).calls.map((call) => call.args)).toContainEqual([
			{
				where: { posterProfileId_idempotencyKey: { posterProfileId: "poster", idempotencyKey: "key" } },
				include: { job: { include: { contact: true } } },
			},
		]);
	});

	it("reserves coordinates without overwriting a concurrent posting request", async () => {
		await repository.reservePostRequest({
			posterProfileId: "poster",
			idempotencyKey: "key",
			requestHash: "hash",
			fuzzyLocation: { latitude: -23.1, longitude: -46.1 },
		});
		expect(td.explain(prisma.jobPostRequest.createMany).calls.map((call) => call.args)).toContainEqual([
			{
				data: [
					{
						posterProfileId: "poster",
						idempotencyKey: "key",
						requestHash: "hash",
						fuzzyLatitude: -23.1,
						fuzzyLongitude: -46.1,
					},
				],
				skipDuplicates: true,
			},
		]);
	});
	it("returns the winning reservation including its persisted coordinates", async () => {
		const winner = {
			id: "request",
			posterProfileId: "poster",
			idempotencyKey: "key",
			requestHash: "hash",
			jobId: null,
			job: null,
			createdAt: row.createdAt,
			fuzzyLatitude: new Prisma.Decimal(-23.2),
			fuzzyLongitude: new Prisma.Decimal(-46.2),
		} satisfies NonNullable<Awaited<ReturnType<JobRepository["findByIdempotencyKey"]>>>;
		td.when(prisma.jobPostRequest.findUniqueOrThrow(td.matchers.anything())).thenResolve(winner);
		expect(
			await repository.reservePostRequest({
				posterProfileId: "poster",
				idempotencyKey: "key",
				requestHash: "hash",
				fuzzyLocation: { latitude: -23.1, longitude: -46.1 },
			}),
		).toBe(winner);
	});
	const createParams = {
		posterProfileId: "poster",
		postRequestId: "request",
		contactId: row.contactId,
		description: row.description,
		payment: row.payment,
		title: row.title,
		descriptionSummary: row.descriptionSummary,
		location: { title: "Rua Pardal Branco, 32", latitude: -23, longitude: -46 },
		locationImageUrl: row.locationImageUrl,
	};
	function _transaction(params: {
		job: typeof row;
		completedJob: typeof row | null;
		fuzzyLatitude: number;
		fuzzyLongitude: number;
	}): { tx: Prisma.TransactionClient; calls: string[] } {
		const calls: string[] = [];
		const tx = td.object<Prisma.TransactionClient>();
		Object.defineProperty(tx, "job", { value: td.object<Prisma.TransactionClient["job"]>() });
		Object.defineProperty(tx, "jobPostRequest", { value: td.object<Prisma.TransactionClient["jobPostRequest"]>() });
		td.when(tx.$queryRaw(td.matchers.anything()), { ignoreExtraArgs: true }).thenDo(async (): Promise<unknown[]> => {
			calls.push("lock");
			return [];
		});
		td.when(tx.$executeRaw(td.matchers.anything()), { ignoreExtraArgs: true }).thenDo(async (): Promise<number> => {
			calls.push("exact-location");
			return 1;
		});
		td.when(tx.job.create(td.matchers.anything())).thenDo(async (): Promise<typeof row> => {
			calls.push("job");
			return params.job;
		});
		td.when(tx.jobPostRequest.findUniqueOrThrow(td.matchers.anything())).thenDo(
			async (): Promise<NonNullable<Awaited<ReturnType<JobRepository["findByIdempotencyKey"]>>>> => {
				calls.push("request");
				return {
					id: "request",
					posterProfileId: "poster",
					idempotencyKey: "key",
					requestHash: "hash",
					createdAt: row.createdAt,
					jobId: params.completedJob?.id ?? null,
					job: params.completedJob,
					fuzzyLatitude: new Prisma.Decimal(params.fuzzyLatitude),
					fuzzyLongitude: new Prisma.Decimal(params.fuzzyLongitude),
				};
			},
		);
		td.when(tx.jobPostRequest.update(td.matchers.anything())).thenDo(
			async (): Promise<Prisma.JobPostRequestGetPayload<Record<string, never>>> => {
				calls.push("complete");
				return {
					id: "request",
					posterProfileId: "poster",
					idempotencyKey: "key",
					requestHash: "hash",
					createdAt: row.createdAt,
					jobId: params.job.id,
					fuzzyLatitude: new Prisma.Decimal(params.fuzzyLatitude),
					fuzzyLongitude: new Prisma.Decimal(params.fuzzyLongitude),
				};
			},
		);
		td.when(prisma.$transaction(td.matchers.anything())).thenDo(
			async <Result>(callback: (transaction: Prisma.TransactionClient) => Promise<Result>): Promise<Result> =>
				callback(tx),
		);
		return { tx: tx, calls: calls };
	}
	it("locks the reservation before atomically creating and completing the job", async () => {
		const { calls } = _transaction({ job: row, completedJob: null, fuzzyLatitude: -23.1, fuzzyLongitude: -46.1 });
		await repository.createJob(createParams);
		expect(calls).toEqual(["lock", "request", "job", "exact-location", "complete"]);
	});
	it("stores only prepared references and the reserved fuzzy location", async () => {
		const { tx } = _transaction({ job: row, completedJob: null, fuzzyLatitude: -23.1, fuzzyLongitude: -46.1 });
		await repository.createJob(createParams);
		expect(td.explain(tx.job.create).calls.map((call) => call.args)).toContainEqual([
			{
				data: expect.objectContaining({
					locationImageUrl: row.locationImageUrl,
					fuzzyLatitude: new Prisma.Decimal(-23.1),
					fuzzyLongitude: new Prisma.Decimal(-46.1),
					status: JobStatus.ACTIVE,
				}),
				include: { contact: true },
			},
		]);
	});
	it("completes the reserved posting key with the created job", async () => {
		const { tx } = _transaction({ job: row, completedJob: null, fuzzyLatitude: -23.1, fuzzyLongitude: -46.1 });
		await repository.createJob(createParams);
		expect(td.explain(tx.jobPostRequest.update).calls.map((call) => call.args)).toEqual([
			[
				{
					where: { id: "request" },
					data: { jobId: row.id },
				},
			],
		]);
	});
	it("returns a concurrently completed job without inserting another", async () => {
		const { tx } = _transaction({ job: row, completedJob: row, fuzzyLatitude: -23.1, fuzzyLongitude: -46.1 });
		await repository.createJob(createParams);
		td.verify(tx.job.create(td.matchers.anything()), { times: 0 });
	});
	it("returns the existing winner after locking", async () => {
		_transaction({ job: row, completedJob: row, fuzzyLatitude: -23.1, fuzzyLongitude: -46.1 });
		expect(await repository.createJob(createParams)).toBe(row);
	});
	it("persists null payment in the job transaction", async () => {
		const { tx } = _transaction({ job: row, completedJob: null, fuzzyLatitude: -23.1, fuzzyLongitude: -46.1 });
		await repository.createJob({ ...createParams, payment: null });
		expect(td.explain(tx.job.create).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ data: expect.objectContaining({ payment: null }) }),
		]);
	});
});
