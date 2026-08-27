import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Observable } from "rxjs";
import { tap } from "rxjs";
import type { ObservabilityService } from "./observability.service";
import { findHttpRequestTerminationReason } from "./http-request-termination.store";
import type { IProductAnalyticsEventMetadata } from "./product-analytics-event.decorator";
import { ProductAnalyticsConstants } from "./product-analytics.constants";

export class ProductAnalyticsInterceptor implements NestInterceptor {
	private readonly _reflector: Reflector;
	private readonly _observabilityService: ObservabilityService;

	constructor(params: { observabilityService: ObservabilityService; reflector: Reflector }) {
		this._observabilityService = params.observabilityService;
		this._reflector = params.reflector;
	}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const metadata = this._reflector.get<IProductAnalyticsEventMetadata>(
			ProductAnalyticsConstants.EVENT_METADATA_KEY,
			context.getHandler(),
		);
		if (metadata === undefined) return next.handle();

		return next.handle().pipe(
			tap({
				complete: () => {
					const httpContext = context.switchToHttp();
					const request = httpContext.getRequest<FastifyRequest>();
					if (findHttpRequestTerminationReason({ request: request }) !== undefined) return;

					const response = httpContext.getResponse<FastifyReply>();
					if (response.statusCode < 200 || response.statusCode >= 400) return;
					if (
						metadata.responseStatusCodes !== undefined &&
						!metadata.responseStatusCodes.includes(response.statusCode)
					) {
						return;
					}

					this._observabilityService.recordProductAnalyticsEvent({ eventName: metadata.eventName });
				},
			}),
		);
	}
}
