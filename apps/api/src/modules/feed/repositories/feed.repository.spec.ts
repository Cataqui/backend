import { Test } from "@nestjs/testing";
import * as td from "testdouble";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { decodeFeedPaginationCursor, encodeFeedPaginationCursor } from "../utils/cursor.utils";
import { type FeedItemRaw, FeedRepository } from "./feed.repository";

const job: FeedItemRaw = {
	id: "12345678-1234-4234-8234-1234567890ab",
	title: "Auxiliar",
	createdAt: new Date("2026-09-22T12:00:00Z"),
	descriptionSummary: "Resumo",
	payment: "R$ 150",
	fuzzyLatitude: new Prisma.Decimal(-23.55),
	fuzzyLongitude: new Prisma.Decimal(-46.63),
	locationImageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
};

afterEach(() => td.reset());

describe("FeedRepository", () => {
	let prisma: PrismaService;
	let repository: FeedRepository;
	beforeEach(async () => {
		prisma = td.object<PrismaService>();
		const module = await Test.createTestingModule({
			providers: [FeedRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();
		repository = module.get(FeedRepository);
	});

	it("returns active jobs with payment text and coordinates", async () => {
		td.when(prisma.job.findMany<{ select: Record<keyof FeedItemRaw, true> }>(td.matchers.anything())).thenResolve([
			job,
		]);
		expect(await repository.getFeedItems({ limit: 20 })).toEqual([job]);
	});

	it("selects payment text and coordinates while ordering active jobs newest first", async () => {
		td.when(prisma.job.findMany<{ select: Record<keyof FeedItemRaw, true> }>(td.matchers.anything())).thenResolve([
			job,
		]);
		await repository.getFeedItems({ limit: 20 });
		expect(td.explain(prisma.job.findMany).calls[0]?.args[0]).toEqual({
			where: { status: "ACTIVE" },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: 20,
			select: {
				id: true,
				title: true,
				createdAt: true,
				descriptionSummary: true,
				payment: true,
				fuzzyLatitude: true,
				fuzzyLongitude: true,
				locationImageUrl: true,
			},
		});
	});

	it("returns payment text from a cursor feed page", async () => {
		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([job]);
		const cursor = decodeFeedPaginationCursor({
			cursor: encodeFeedPaginationCursor({
				createdAt: "2026-09-22T13:00:00Z",
				jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}),
		});
		expect(await repository.getFeedItems({ cursor: cursor, limit: 20 })).toEqual([job]);
	});

	it("selects payment text in the cursor feed query", async () => {
		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([job]);
		const cursor = decodeFeedPaginationCursor({
			cursor: encodeFeedPaginationCursor({
				createdAt: "2026-09-22T13:00:00Z",
				jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}),
		});
		await repository.getFeedItems({ cursor: cursor, limit: 20 });
		const sql: Prisma.Sql = td.explain(prisma.$queryRaw).calls[0]!.args[0];
		expect(sql.text).toContain('"payment"');
	});

	it("binds the active status in the cursor feed query", async () => {
		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([job]);
		const cursor = decodeFeedPaginationCursor({
			cursor: encodeFeedPaginationCursor({
				createdAt: "2026-09-22T13:00:00Z",
				jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}),
		});
		await repository.getFeedItems({ cursor: cursor, limit: 20 });
		const sql: Prisma.Sql = td.explain(prisma.$queryRaw).calls[0]!.args[0];

		expect(sql.values).toContain("ACTIVE");
	});

	it("binds the requested limit in the cursor feed query", async () => {
		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([job]);
		const cursor = decodeFeedPaginationCursor({
			cursor: encodeFeedPaginationCursor({
				createdAt: "2026-09-22T13:00:00Z",
				jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}),
		});
		await repository.getFeedItems({ cursor: cursor, limit: 20 });
		const sql: Prisma.Sql = td.explain(prisma.$queryRaw).calls[0]!.args[0];

		expect(sql.values).toContain(20);
	});

	it("excludes archived jobs from the first feed page", async () => {
		td.when(prisma.job.findMany<{ select: Record<keyof FeedItemRaw, true> }>(td.matchers.anything())).thenResolve([]);
		await repository.getFeedItems({ limit: 20 });
		expect(td.explain(prisma.job.findMany).calls[0]?.args[0]).toEqual(
			expect.objectContaining({ where: { status: "ACTIVE" } }),
		);

		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([]);
		await repository.getFeedItems({
			cursor: decodeFeedPaginationCursor({
				cursor: encodeFeedPaginationCursor({
					createdAt: "2026-09-22T13:00:00Z",
					jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				}),
			}),
			limit: 20,
		});
	});

	it("filters status in the subsequent feed page SQL", async () => {
		td.when(prisma.job.findMany<{ select: Record<keyof FeedItemRaw, true> }>(td.matchers.anything())).thenResolve([]);
		await repository.getFeedItems({ limit: 20 });

		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([]);
		await repository.getFeedItems({
			cursor: decodeFeedPaginationCursor({
				cursor: encodeFeedPaginationCursor({
					createdAt: "2026-09-22T13:00:00Z",
					jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				}),
			}),
			limit: 20,
		});
		const sql: Prisma.Sql = td.explain(prisma.$queryRaw).calls[0]!.args[0];
		expect(sql.text).toContain('"status" = ');
	});

	it("binds the active status for subsequent feed pages", async () => {
		td.when(prisma.job.findMany<{ select: Record<keyof FeedItemRaw, true> }>(td.matchers.anything())).thenResolve([]);
		await repository.getFeedItems({ limit: 20 });

		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([]);
		await repository.getFeedItems({
			cursor: decodeFeedPaginationCursor({
				cursor: encodeFeedPaginationCursor({
					createdAt: "2026-09-22T13:00:00Z",
					jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				}),
			}),
			limit: 20,
		});
		const sql: Prisma.Sql = td.explain(prisma.$queryRaw).calls[0]!.args[0];

		expect(sql.values).toContain("ACTIVE");
	});

	it("returns null payment from the first feed query", async () => {
		const unpaidJob = { ...job, payment: null };
		td.when(prisma.job.findMany<{ select: Record<keyof FeedItemRaw, true> }>(td.matchers.anything())).thenResolve([
			unpaidJob,
		]);
		expect(await repository.getFeedItems({ limit: 20 })).toEqual([unpaidJob]);
		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([unpaidJob]);
		const cursor = decodeFeedPaginationCursor({
			cursor: encodeFeedPaginationCursor({
				createdAt: "2026-09-22T13:00:00Z",
				jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}),
		});
		await repository.getFeedItems({ cursor: cursor, limit: 20 });
	});

	it("returns null payment from a cursor feed query", async () => {
		const unpaidJob = { ...job, payment: null };
		td.when(prisma.job.findMany<{ select: Record<keyof FeedItemRaw, true> }>(td.matchers.anything())).thenResolve([
			unpaidJob,
		]);
		await repository.getFeedItems({ limit: 20 });
		td.when(prisma.$queryRaw<FeedItemRaw[]>(td.matchers.anything())).thenResolve([unpaidJob]);
		const cursor = decodeFeedPaginationCursor({
			cursor: encodeFeedPaginationCursor({
				createdAt: "2026-09-22T13:00:00Z",
				jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}),
		});
		expect(await repository.getFeedItems({ cursor: cursor, limit: 20 })).toEqual([unpaidJob]);
	});
});
