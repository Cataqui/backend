import { Test, type TestingModule } from "@nestjs/testing";
import { vi } from "vitest";
import { PaginatedResult } from "../../shared/results/paginated-result";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";

const mockService = {
	getFeed: vi.fn(),
};

describe("FeedController", () => {
	let controller: FeedController;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [FeedController],
			providers: [FeedService, { provide: FeedService, useValue: mockService }],
		}).compile();

		controller = module.get<FeedController>(FeedController);
		vi.clearAllMocks();
	});

	describe("getFeed", () => {
		it("should call the service with the cursor", async () => {
			mockService.getFeed.mockResolvedValue(
				PaginatedResult.create({ data: [], pagination: { hasMore: false, nextCursor: null } }),
			);

			await controller.getFeed({ cursor: "abc" });

			expect(mockService.getFeed).toHaveBeenCalledWith({ cursor: "abc" });
		});

		it("should call service with undefined values for missing params", async () => {
			mockService.getFeed.mockResolvedValue(
				PaginatedResult.create({ data: [], pagination: { hasMore: false, nextCursor: null } }),
			);

			await controller.getFeed({});

			expect(mockService.getFeed).toHaveBeenCalledWith({ cursor: undefined });
		});

		it("should return the paginated result from the service", async () => {
			const expected = PaginatedResult.create({
				data: [
					{
						jobId: "abc",
						title: "Test",
						createdAt: "2026-01-01T00:00:00.000Z",
						descriptionSummary: "",
						payment: {},
						location: {},
					},
				],
				pagination: { hasMore: false, nextCursor: null },
			});
			mockService.getFeed.mockResolvedValue(expected);

			const result = await controller.getFeed({});

			expect(result).toBe(expected);
		});
	});
});
