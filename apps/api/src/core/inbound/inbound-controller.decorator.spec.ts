import { SKIP_ENVELOPE_KEY } from "../../shared/decorators/skip-envelope.decorator";
import { InboundController } from "./inbound-controller.decorator";

describe("InboundController", () => {
	it("should exclude inbound controllers from Swagger", () => {
		@InboundController()
		class TestInboundController {}

		expect(Reflect.getMetadata("swagger/apiExcludeController", TestInboundController)).toEqual([true]);
	});

	it("should bypass the public API response envelope for inbound controllers", () => {
		@InboundController()
		class TestInboundController {}

		expect(Reflect.getMetadata(SKIP_ENVELOPE_KEY, TestInboundController)).toBe(true);
	});
});
