import { SetMetadata } from "@nestjs/common";
import { ProductAnalyticsEventName } from "./product-analytics-event-name.enum";
import { ProductAnalyticsConstants } from "./product-analytics.constants";

export interface IProductAnalyticsEventMetadata {
	eventName: ProductAnalyticsEventName;
	responseStatusCodes?: readonly number[];
}

export function ProductAnalyticsEvent(metadata: IProductAnalyticsEventMetadata): MethodDecorator {
	return SetMetadata(ProductAnalyticsConstants.EVENT_METADATA_KEY, metadata);
}
