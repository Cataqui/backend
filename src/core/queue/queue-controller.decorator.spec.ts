import { PATH_METADATA } from "@nestjs/common/constants";
import { SKIP_ENVELOPE_KEY } from "../../shared/decorators/skip-envelope.decorator";
import { QueueController } from "./queue-controller.decorator";

describe("QueueController", () => {
	it("should keep every decorated controller beneath the internal Queue path", () => {
		@QueueController()
		class TestQueueController {}

		expect(Reflect.getMetadata(PATH_METADATA, TestQueueController)).toBe("internal/queues");
	});

	it("should exclude Queue controllers from Swagger", () => {
		@QueueController()
		class TestQueueController {}

		expect(Reflect.getMetadata("swagger/apiExcludeController", TestQueueController)).toEqual([true]);
	});

	it("should bypass the public API response envelope for Queue controllers", () => {
		@QueueController()
		class TestQueueController {}

		expect(Reflect.getMetadata(SKIP_ENVELOPE_KEY, TestQueueController)).toBe(true);
	});
});
