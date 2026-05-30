import { Test, type TestingModule } from "@nestjs/testing";
import { FeedRepository } from "./feed.repository";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { CursorUtils } from "../utils/cursor.utils";
import { FeedSort } from "../enums/feed-sort.enum";
import { vi } from "vitest";

const mockFindMany = vi.fn();

const mockPrisma = {
	job: {
		findMany: mockFindMany,
	},
};

function getCallArgs(callIndex: number): Record<string, unknown> {
	return mockFindMany.mock.calls[callIndex]![0] as Record<string, unknown>;
}

function getWhere(callIndex: number): Record<string, unknown> {
	return (getCallArgs(callIndex)["where"] ?? {}) as Record<string, unknown>;
}

describe("FeedRepository", () => {
	let repository: FeedRepository;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [FeedRepository, { provide: PrismaService, useValue: mockPrisma }],
		}).compile();

		repository = module.get<FeedRepository>(FeedRepository);
		vi.clearAllMocks();
	});

	describe("getFeedItems", () => {
		it("should query ACTIVE jobs", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 20 });

			const where = getWhere(0);

			expect(where["status"]).toBe("ACTIVE");
			expect(where["expiresAt"]).toBeUndefined();
		});

		it("should order by createdAt DESC and id DESC", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 20 });

			const callArgs = getCallArgs(0);

			expect(callArgs["orderBy"]).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
		});

		it("should limit results to specified limit", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 21 });

			const callArgs = getCallArgs(0);

			expect(callArgs["take"]).toBe(21);
		});

		it("should include cursor condition when cursor is provided", async () => {
			mockFindMany.mockResolvedValue([]);

			const cursor = CursorUtils.decodeCursor(CursorUtils.encodeCursor({ sort: FeedSort.LATEST, createdAt: "2026-05-28T10:00:00.000Z", jobId: "abc-123" }), FeedSort.LATEST);

			await repository.getFeedItems({ cursor, limit: 20 });

			const where = getWhere(0);
			const orConditions = where["OR"] as Record<string, unknown>[];

			expect(orConditions).toBeDefined();
			expect(orConditions[0]).toEqual({ createdAt: { lt: new Date("2026-05-28T10:00:00.000Z") } });
			expect(orConditions[1]).toEqual({ createdAt: new Date("2026-05-28T10:00:00.000Z"), id: { lt: "abc-123" } });
		});

		it("should not include cursor condition when cursor is not provided", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 20 });

			const where = getWhere(0);

			expect(where["OR"]).toBeUndefined();
		});

		it("should select only needed fields", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 20 });

			const callArgs = getCallArgs(0);

			expect(callArgs["select"]).toEqual({
				id: true,
				title: true,
				createdAt: true,
				paymentType: true,
				paymentMinAmount: true,
				paymentMaxAmount: true,
				paymentNote: true,
				paymentAmountPeriod: true,
				paymentCurrency: true,
				neighborhood: true,
				city: true,
				state: true,
			});
		});
	});
});
