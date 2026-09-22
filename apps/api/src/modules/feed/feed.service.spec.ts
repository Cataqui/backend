import { Test, type TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client.js";
import { InvalidCursorError } from "./errors/invalid-cursor.error";
import { FeedService } from "./feed.service";
import { type FeedItemRaw, FeedRepository } from "./repositories/feed.repository";
import { CursorUtils } from "./utils/cursor.utils";

function _createMockFeedItemRaw(overrides: Partial<FeedItemRaw> & { id: string; createdAt: Date }): FeedItemRaw {
	return {
		id: overrides.id,
		title: overrides.title ?? "Help unload truck",
		createdAt: overrides.createdAt,
		descriptionSummary: overrides.descriptionSummary ?? "",
		payment: overrides.payment ?? "R$ 150",
		fuzzyLatitude: overrides.fuzzyLatitude ?? new Prisma.Decimal("-23.550000"),
		fuzzyLongitude: overrides.fuzzyLongitude ?? new Prisma.Decimal("-46.630000"),
	};
}

const mockRepository = {
	getFeedItems: vi.fn() as Mock,
};

const PAGE_SIZE = 20;

describe("FeedService", () => {
	let service: FeedService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [FeedService, { provide: FeedRepository, useValue: mockRepository }],
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

		it("should query without a cursor when pagination has not started", async () => {
			mockRepository.getFeedItems.mockResolvedValue([]);

			await service.getFeed({});

			expect(mockRepository.getFeedItems).toHaveBeenCalledWith(expect.objectContaining({ cursor: undefined }));
		});

		it("should pass cursor to repository when provided", async () => {
			const items = Array.from({ length: 5 }, (_, i) =>
				_createMockFeedItemRaw({
					id: `job-${i}`,
					createdAt: new Date(`2026-05-2${8 - i}T10:00:00.000Z`),
				}),
			);
			mockRepository.getFeedItems.mockResolvedValue(items);

			const encodedCursor = CursorUtils.encodeCursor({
				createdAt: "2026-05-28T10:00:00.000Z",
				jobId: "12345678-1234-4234-8234-1234567890ab",
			});

			const result = await service.getFeed({
				cursor: encodedCursor,
			});

			expect({
				repositoryParams: mockRepository.getFeedItems.mock.calls[0]?.[0],
				itemCount: result.data.length,
			}).toEqual({
				repositoryParams: expect.objectContaining({
					cursor: expect.objectContaining({
						createdAt: "2026-05-28T10:00:00.000Z",
						jobId: "12345678-1234-4234-8234-1234567890ab",
					}),
				}),
				itemCount: 5,
			});
		});

		it("should return hasMore true and build nextCursor when more results exist", async () => {
			const now = new Date("2026-05-28T10:00:00.000Z");
			const items = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
				_createMockFeedItemRaw({
					id: `job-${i}`,
					createdAt: new Date(now.getTime() - i * 60000),
				}),
			);
			mockRepository.getFeedItems.mockResolvedValue(items);

			const result = await service.getFeed({});

			expect({ itemCount: result.data.length, pagination: result.pagination }).toEqual({
				itemCount: PAGE_SIZE,
				pagination: { hasMore: true, nextCursor: expect.any(String) },
			});
		});

		it("should return hasMore false and null cursor when no more results", async () => {
			const now = new Date("2026-05-28T10:00:00.000Z");
			const items = Array.from({ length: PAGE_SIZE - 5 }, (_, i) =>
				_createMockFeedItemRaw({
					id: `job-${i}`,
					createdAt: new Date(now.getTime() - i * 60000),
				}),
			);
			mockRepository.getFeedItems.mockResolvedValue(items);

			const result = await service.getFeed({});

			expect({ itemCount: result.data.length, pagination: result.pagination }).toEqual({
				itemCount: PAGE_SIZE - 5,
				pagination: { hasMore: false, nextCursor: null },
			});
		});

		it("should throw on invalid cursor", async () => {
			await expect(service.getFeed({ cursor: "invalid-cursor" })).rejects.toThrow(InvalidCursorError);
		});

		it("should map raw database results to the feed-item output contract", async () => {
			const items = [
				_createMockFeedItemRaw({
					id: "job-1",
					createdAt: new Date("2026-05-28T10:00:00.000Z"),
				}),
			];
			mockRepository.getFeedItems.mockResolvedValue(items);

			const result = await service.getFeed({});

			expect(result.data[0]).toMatchObject({
				jobId: "job-1",
				title: "Help unload truck",
				payment: "R$ 150",
				location: { latitude: -23.55, longitude: -46.63, areaRadius: 2_000 },
			});
		});

		it("should return data with pagination metadata", async () => {
			mockRepository.getFeedItems.mockResolvedValue([]);

			const result = await service.getFeed({});

			expect(result).toMatchObject({ data: [], pagination: { hasMore: false, nextCursor: null } });
		});
	});
});
