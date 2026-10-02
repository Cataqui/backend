import { Test } from "@nestjs/testing";
import { Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { decodeFeedPaginationCursor, encodeFeedPaginationCursor } from "../utils/cursor.utils";
import { FeedRepository } from "./feed.repository";

const job = {
	id: "12345678-1234-4234-8234-1234567890ab",
	title: "Auxiliar",
	createdAt: new Date("2026-09-22T12:00:00Z"),
	descriptionSummary: "Resumo",
	payment: "R$ 150",
	fuzzyLatitude: new Prisma.Decimal(-23.55),
	fuzzyLongitude: new Prisma.Decimal(-46.63),
	locationImageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
};

describe("FeedRepository", () => {
	const prisma = { $queryRaw: vi.fn(), job: { findMany: vi.fn() } };
	let repository: FeedRepository;
	beforeEach(async () => {
		vi.resetAllMocks();
		const module = await Test.createTestingModule({
			providers: [FeedRepository, { provide: PrismaService, useValue: prisma }],
		}).compile();
		repository = module.get(FeedRepository);
	});

	it("queries active jobs with payment text and coordinates", async () => {
		prisma.job.findMany.mockResolvedValue([job]);
		expect(await repository.getFeedItems({ limit: 20 })).toEqual([job]);
		expect(prisma.job.findMany).toHaveBeenCalledWith({
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

	it("uses a parameterized cursor query and returns payment text", async () => {
		prisma.$queryRaw.mockResolvedValue([job]);
		const cursor = decodeFeedPaginationCursor({
			cursor: encodeFeedPaginationCursor({
				createdAt: "2026-09-22T13:00:00Z",
				jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}),
		});
		expect(await repository.getFeedItems({ cursor: cursor, limit: 20 })).toEqual([job]);
		const sql: Prisma.Sql = prisma.$queryRaw.mock.calls[0]![0];
		expect(sql.text).toContain('"payment"');
		expect(sql.values).toContain("ACTIVE");
		expect(sql.values).toContain(20);
	});

	it("excludes archived jobs from both the first and subsequent feed pages", async () => {
		prisma.job.findMany.mockResolvedValue([]);
		await repository.getFeedItems({ limit: 20 });
		expect(prisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "ACTIVE" } }));

		prisma.$queryRaw.mockResolvedValue([]);
		await repository.getFeedItems({
			cursor: decodeFeedPaginationCursor({
				cursor: encodeFeedPaginationCursor({
					createdAt: "2026-09-22T13:00:00Z",
					jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				}),
			}),
			limit: 20,
		});
		const sql: Prisma.Sql = prisma.$queryRaw.mock.calls[0]![0];
		expect(sql.text).toContain('"status" = ');
		expect(sql.values).toContain("ACTIVE");
	});

	it("returns null payment from both feed query paths", async () => {
		const unpaidJob = { ...job, payment: null };
		prisma.job.findMany.mockResolvedValue([unpaidJob]);
		expect(await repository.getFeedItems({ limit: 20 })).toEqual([unpaidJob]);
		prisma.$queryRaw.mockResolvedValue([unpaidJob]);
		const cursor = decodeFeedPaginationCursor({
			cursor: encodeFeedPaginationCursor({
				createdAt: "2026-09-22T13:00:00Z",
				jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}),
		});
		expect(await repository.getFeedItems({ cursor: cursor, limit: 20 })).toEqual([unpaidJob]);
	});
});
