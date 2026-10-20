import { Test, type TestingModule } from "@nestjs/testing";
import * as td from "testdouble";
import { PaginatedResult } from "../../shared/results/paginated-result";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";

afterEach(() => td.reset());

describe("FeedController", () => {
	let mockService: FeedService;
	let controller: FeedController;

	beforeEach(async () => {
		mockService = td.object<FeedService>();
		const module: TestingModule = await Test.createTestingModule({
			controllers: [FeedController],
			providers: [FeedService, { provide: FeedService, useValue: mockService }],
		}).compile();

		controller = module.get<FeedController>(FeedController);
	});

	describe("getFeed", () => {
		it("should call the service with the cursor", async () => {
			td.when(mockService.getFeed(td.matchers.anything())).thenResolve(
				PaginatedResult.create({ data: [], pagination: { hasMore: false, nextCursor: null } }),
			);

			await controller.getFeed({ cursor: "abc" });

			expect(td.explain(mockService.getFeed).calls[0]?.args[0]).toEqual({ cursor: "abc" });
		});

		it("should call service with undefined values for missing params", async () => {
			td.when(mockService.getFeed(td.matchers.anything())).thenResolve(
				PaginatedResult.create({ data: [], pagination: { hasMore: false, nextCursor: null } }),
			);

			await controller.getFeed({});

			expect(td.explain(mockService.getFeed).calls[0]?.args[0]).toEqual({ cursor: undefined });
		});

		it("should return the paginated result from the service", async () => {
			const expected: Awaited<ReturnType<FeedService["getFeed"]>> = PaginatedResult.create({
				data: [
					{
						jobId: "abc",
						title: "Test",
						createdAt: "2026-01-01T00:00:00.000Z",
						descriptionSummary: "",
						payment: null,
						location: {
							latitude: -23,
							longitude: -46,
							areaRadius: 2000,
							imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
						},
					},
				],
				pagination: { hasMore: false, nextCursor: null },
			});
			td.when(mockService.getFeed(td.matchers.anything())).thenResolve(expected);

			const result = await controller.getFeed({});

			expect(result).toBe(expected);
		});
	});
});
