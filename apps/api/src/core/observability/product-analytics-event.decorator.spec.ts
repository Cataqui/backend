import { ProductAnalyticsEvent } from "./product-analytics-event.decorator";
import { ProductAnalyticsEventName } from "./product-analytics-event-name.enum";
import { ProductAnalyticsConstants } from "./product-analytics.constants";

describe("ProductAnalyticsEvent", () => {
	it("should store the complete typed product analytics contract as route metadata", () => {
		class TestController {
			@ProductAnalyticsEvent({
				eventName: ProductAnalyticsEventName.JOB_PUBLISH_REQUEST_SUCCEEDED,
				responseStatusCodes: [200],
			})
			publish(): void {}
		}

		expect(Reflect.getMetadata(ProductAnalyticsConstants.EVENT_METADATA_KEY, TestController.prototype.publish)).toEqual(
			{
				eventName: ProductAnalyticsEventName.JOB_PUBLISH_REQUEST_SUCCEEDED,
				responseStatusCodes: [200],
			},
		);
	});
});
