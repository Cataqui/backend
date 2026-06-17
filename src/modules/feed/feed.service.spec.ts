import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { MapService } from "../map/map.service";
import { FeedSort } from "./enums/feed-sort.enum";
import { InvalidCursorError } from "./errors/invalid-cursor.error";
import { FeedService } from "./feed.service";
import { type FeedItemRaw, FeedRepository } from "./repositories/feed.repository";
import { CursorUtils } from "./utils/cursor.utils";

function createMockFeedItemRaw(overrides: Partial<FeedItemRaw> & { id: string; createdAt: Date }): FeedItemRaw {
	return {
		id: overrides.id,
		title: overrides.title ?? "Help unload truck",
		createdAt: overrides.createdAt,
		descriptionSummary: overrides.descriptionSummary ?? "",
		paymentType: overrides.paymentType ?? ("FIXED" as const),
		paymentMinAmount: overrides.paymentMinAmount ?? { toNumber: () => 150.0 },
		paymentMaxAmount: overrides.paymentMaxAmount ?? null,
		paymentNote: overrides.paymentNote ?? null,
		paymentAmountPeriod: overrides.paymentAmountPeriod ?? ("SINGLE" as const),
		paymentCurrency: overrides.paymentCurrency ?? "BRL",
		neighborhood: overrides.neighborhood ?? "Centro",
		fuzzyLatitude: overrides.fuzzyLatitude ?? { toNumber: () => -23.55 },
		fuzzyLongitude: overrides.fuzzyLongitude ?? { toNumber: () => -46.63 },
	};
}

const mockRepository = {
	getFeedItems: vi.fn() as Mock,
};

const mockMapService = {
	getConfig: vi.fn().mockResolvedValue({
		queryParams: "v=1&sig=abc&exp=123",
		expiresAt: "2026-01-01T00:00:00.000Z",
		mapVersion: "br",
		fontstack: "inter",
		tilesUrlTemplate: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
	}),
};

const PAGE_SIZE = 20;

describe("FeedService", () => {
	let service: FeedService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				FeedService,
				{ provide: FeedRepository, useValue: mockRepository },
				{ provide: MapService, useValue: mockMapService },
			],
		}).compile();

		service = module.get<FeedService>(FeedService);
		vi.clearAllMocks();
	});

	describe("getFeed", () => {
		it("should request limit + 1 items from repository", async () => {
			mockRepository.getFeedItems.mockResolvedValue([]);

			await service.getFeed({});

			expect(mockRepository.getFeedItems).toHaveBeenCalledWith(expect.objectContaining({ limit: PAGE_SIZE + 1 }));
		});

		it("should use default sort LATEST when not provided", async () => {
			mockRepository.getFeedItems.mockResolvedValue([]);

			await service.getFeed({});

			expect(mockRepository.getFeedItems).toHaveBeenCalledWith(expect.objectContaining({ cursor: undefined }));
		});

		it("should pass cursor to repository when provided", async () => {
			const items = Array.from({ length: 5 }, (_, i) =>
				createMockFeedItemRaw({
					id: `job-${i}`,
					createdAt: new Date(`2026-05-2${8 - i}T10:00:00.000Z`),
				}),
			);
			mockRepository.getFeedItems.mockResolvedValue(items);

			const encodedCursor = CursorUtils.encodeCursor({
				sort: FeedSort.LATEST,
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-1234-1234-1234567890ab",
			});

			const result = await service.getFeed({
				cursor: encodedCursor,
			});

			expect(mockRepository.getFeedItems).toHaveBeenCalledWith(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				expect.objectContaining({
					cursor: expect.objectContaining({
						createdAt: "2026-05-28T10:00:00.000Z",
						jobId: "12345678-1234-1234-1234-1234567890ab",
					}),
				}),
			);
			expect(result.data).toHaveLength(5);
		});

		it("should return hasMore true and build nextCursor when more results exist", async () => {
			const now = new Date("2026-05-28T10:00:00.000Z");
			const items = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
				createMockFeedItemRaw({
					id: `job-${i}`,
					createdAt: new Date(now.getTime() - i * 60000),
				}),
			);
			mockRepository.getFeedItems.mockResolvedValue(items);

			const result = await service.getFeed({});

			expect(result.data).toHaveLength(PAGE_SIZE);
			expect(result.pagination.hasMore).toBe(true);
			expect(result.pagination.nextCursor).toBeTruthy();
		});

		it("should return hasMore false and null cursor when no more results", async () => {
			const now = new Date("2026-05-28T10:00:00.000Z");
			const items = Array.from({ length: PAGE_SIZE - 5 }, (_, i) =>
				createMockFeedItemRaw({
					id: `job-${i}`,
					createdAt: new Date(now.getTime() - i * 60000),
				}),
			);
			mockRepository.getFeedItems.mockResolvedValue(items);

			const result = await service.getFeed({});

			expect(result.data).toHaveLength(PAGE_SIZE - 5);
			expect(result.pagination.hasMore).toBe(false);
			expect(result.pagination.nextCursor).toBeNull();
		});

		it("should throw on invalid cursor", async () => {
			await expect(service.getFeed({ cursor: "invalid-cursor" })).rejects.toThrow(InvalidCursorError);
		});

		it("should map raw results to FeedItemOutputDto", async () => {
			const items = [
				createMockFeedItemRaw({
					id: "job-1",
					createdAt: new Date("2026-05-28T10:00:00.000Z"),
				}),
			];
			mockRepository.getFeedItems.mockResolvedValue(items);

			const result = await service.getFeed({});

			expect(result.data[0]!.jobId).toBe("job-1");
			expect(result.data[0]!.title).toBe("Help unload truck");
			expect(result.data[0]!.payment.type).toBe("FIXED");
			expect(result.data[0]!.payment.minAmount).toBe(150.0);
			expect(result.data[0]!.location.neighborhood).toBe("Centro");
		});

		it("should call MapService.getConfig with BR region", async () => {
			mockRepository.getFeedItems.mockResolvedValue([]);

			await service.getFeed({});

			expect(mockMapService.getConfig).toHaveBeenCalledWith({ region: "BR" });
		});

		it("should set mapConfig on all feed items location", async () => {
			const mockConfig = {
				queryParams: "v=1&sig=abc&exp=123",
				expiresAt: "2026-01-01T00:00:00.000Z",
				mapVersion: "br",
				fontstack: "inter",
				tilesUrlTemplate: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
			};

			const items = [
				createMockFeedItemRaw({ id: "job-1", createdAt: new Date("2026-05-28T10:00:00.000Z") }),
				createMockFeedItemRaw({ id: "job-2", createdAt: new Date("2026-05-27T10:00:00.000Z") }),
			];
			mockRepository.getFeedItems.mockResolvedValue(items);

			const result = await service.getFeed({});

			expect(result.data[0]!.location.mapConfig).toEqual(mockConfig);
			expect(result.data[1]!.location.mapConfig).toEqual(mockConfig);
		});

		it("should return PaginatedResponseDto structure", async () => {
			mockRepository.getFeedItems.mockResolvedValue([]);

			const result = await service.getFeed({});

			expect(result).toHaveProperty("data");
			expect(result).toHaveProperty("pagination");
			expect(result.pagination).toHaveProperty("hasMore");
			expect(result.pagination).toHaveProperty("nextCursor");
		});
	});
});
