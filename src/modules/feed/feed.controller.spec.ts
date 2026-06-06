import { Test, type TestingModule } from "@nestjs/testing";
import { plainToInstance } from "class-transformer";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { PaginatedResponseDto } from "../../shared/dto/paginated-response.dto";
import { PaginationOutputDto } from "../../shared/dto/pagination-output.dto";
import { FeedItemOutputDto } from "./dto/feed-item-output.dto";
import { FeedRequestQueryDto } from "./dto/feed-request-query.dto";
import type { FeedSort } from "./enums/feed-sort.enum";
import { vi } from "vitest";

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
		it("should call service with cursor and sort params", async () => {
			mockService.getFeed.mockResolvedValue(new PaginatedResponseDto([], new PaginationOutputDto(false, null)));

			await controller.getFeed({ cursor: "abc", sort: "LATEST" as FeedSort });

			expect(mockService.getFeed).toHaveBeenCalledWith({ cursor: "abc", sort: "LATEST" });
		});

		it("should call service with undefined values for missing params", async () => {
			mockService.getFeed.mockResolvedValue(new PaginatedResponseDto([], new PaginationOutputDto(false, null)));

			await controller.getFeed(plainToInstance(FeedRequestQueryDto, {}));

			expect(mockService.getFeed).toHaveBeenCalledWith({ cursor: undefined, sort: undefined });
		});

		it("should return PaginatedResponseDto from service", async () => {
			const expected = new PaginatedResponseDto(
				[new FeedItemOutputDto({ jobId: "abc", title: "Test", createdAt: "2026-01-01T00:00:00.000Z", payment: {} as never, location: {} as never })],
				new PaginationOutputDto(false, null),
			);
			mockService.getFeed.mockResolvedValue(expected);

			const result = await controller.getFeed(plainToInstance(FeedRequestQueryDto, {}));

			expect(result).toBe(expected);
		});
	});
});
