import { Test, type TestingModule } from "@nestjs/testing";
import { vi } from "vitest";
import { Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { CursorUtils } from "../utils/cursor.utils";
import { FeedRepository } from "./feed.repository";

const mockFindMany = vi.fn();
const mockQueryRaw = vi.fn();

const mockPrisma = {
	$queryRaw: mockQueryRaw,
	job: {
		findMany: mockFindMany,
	},
};

function _getCallArgs(callIndex: number): Record<string, unknown> {
	return mockFindMany.mock.calls[callIndex]![0] as Record<string, unknown>;
}

function _getWhere(callIndex: number): Record<string, unknown> {
	return (_getCallArgs(callIndex)["where"] ?? {}) as Record<string, unknown>;
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
		it("should query only complete ACTIVE jobs", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 20 });

			const where = _getWhere(0);

			expect(where).toEqual({
				status: "ACTIVE",
				title: { not: null },
				descriptionSummary: { not: null },
				paymentType: { not: null },
				paymentAmountPeriod: { not: null },
				paymentCurrency: { not: null },
				neighborhood: { not: null },
				fuzzyLatitude: { not: null },
				fuzzyLongitude: { not: null },
			});
		});

		it("should order by createdAt DESC and id DESC", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 20 });

			const callArgs = _getCallArgs(0);

			expect(callArgs["orderBy"]).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
		});

		it("should limit results to specified limit", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 21 });

			const callArgs = _getCallArgs(0);

			expect(callArgs["take"]).toBe(21);
		});

		it("should include cursor condition when cursor is provided", async () => {
			mockQueryRaw.mockResolvedValue([]);

			const cursor = CursorUtils.decodeCursor({
				cursor: CursorUtils.encodeCursor({
					createdAt: "2026-05-28T10:00:00.000Z",
					jobId: "12345678-1234-4234-8234-1234567890ab",
				}),
			});

			await repository.getFeedItems({ cursor: cursor, limit: 20 });

			const query: unknown = mockQueryRaw.mock.calls[0]?.[0];
			expect(query).toBeInstanceOf(Prisma.Sql);
			if (!(query instanceof Prisma.Sql)) throw new Error("Expected the cursor query to use parameterized Prisma SQL");

			expect(query.text).toContain('("created_at", "id") < (');
			expect(query.text).not.toContain("12345678-1234-4234-8234-1234567890ab");
			expect(query.values).toEqual([
				"ACTIVE",
				new Date("2026-05-28T10:00:00.000Z"),
				"12345678-1234-4234-8234-1234567890ab",
				20,
			]);
			expect(mockFindMany).not.toHaveBeenCalled();
		});

		it("should preserve Decimal values returned by the parameterized cursor query", async () => {
			const cursorJob = {
				id: "12345678-1234-4234-8234-1234567890ab",
				title: "Auxiliar",
				createdAt: new Date("2026-05-28T09:59:00.000Z"),
				descriptionSummary: "Resumo",
				paymentType: "FIXED",
				paymentMinAmount: new Prisma.Decimal("150.00"),
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: "DAILY",
				paymentCurrency: "BRL",
				neighborhood: "Centro",
				fuzzyLatitude: new Prisma.Decimal("-23.550000"),
				fuzzyLongitude: new Prisma.Decimal("-46.630000"),
			};
			mockQueryRaw.mockResolvedValue([cursorJob]);

			const result = await repository.getFeedItems({
				cursor: CursorUtils.decodeCursor({
					cursor: CursorUtils.encodeCursor({
						createdAt: "2026-05-28T10:00:00.000Z",
						jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					}),
				}),
				limit: 20,
			});

			expect(result).toEqual([cursorJob]);
		});

		it("should not include cursor condition when cursor is not provided", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 20 });

			const where = _getWhere(0);

			expect(where["OR"]).toBeUndefined();
		});

		it("should select only needed fields", async () => {
			mockFindMany.mockResolvedValue([]);

			await repository.getFeedItems({ limit: 20 });

			const callArgs = _getCallArgs(0);

			expect(callArgs["select"]).toEqual({
				id: true,
				title: true,
				createdAt: true,
				descriptionSummary: true,
				paymentType: true,
				paymentMinAmount: true,
				paymentMaxAmount: true,
				paymentNote: true,
				paymentAmountPeriod: true,
				paymentCurrency: true,
				neighborhood: true,
				fuzzyLatitude: true,
				fuzzyLongitude: true,
			});
		});

		it("should return complete active jobs selected from the shared jobs table", async () => {
			const activeJob = {
				id: "12345678-1234-4234-8234-1234567890ab",
				title: "Auxiliar",
				createdAt: new Date("2026-07-30T12:00:00.000Z"),
				descriptionSummary: "Resumo",
				paymentType: "FIXED",
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: "MONTHLY",
				paymentCurrency: "BRL",
				neighborhood: "Centro",
				fuzzyLatitude: { toNumber: (): number => -23.55 },
				fuzzyLongitude: { toNumber: (): number => -46.63 },
			};
			mockFindMany.mockResolvedValue([activeJob]);

			const result = await repository.getFeedItems({ limit: 20 });

			expect(result).toEqual([activeJob]);
		});

		it("should reject an active row that violates required feed-field invariants", async () => {
			mockFindMany.mockResolvedValue([
				{
					id: "12345678-1234-4234-8234-1234567890ab",
					title: null,
					createdAt: new Date("2026-07-30T12:00:00.000Z"),
					descriptionSummary: null,
					paymentType: null,
					paymentMinAmount: null,
					paymentMaxAmount: null,
					paymentNote: null,
					paymentAmountPeriod: null,
					paymentCurrency: null,
					neighborhood: null,
					fuzzyLatitude: null,
					fuzzyLongitude: null,
				},
			]);

			await expect(repository.getFeedItems({ limit: 20 })).rejects.toThrow(
				"Active job 12345678-1234-4234-8234-1234567890ab is missing fields required by the feed.",
			);
		});
	});
});
