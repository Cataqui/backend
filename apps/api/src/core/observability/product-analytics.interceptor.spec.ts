import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { of, throwError } from "rxjs";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";
import { rememberHttpRequestTermination } from "./http-request-termination.store";
import { ProductAnalyticsEvent } from "./product-analytics-event.decorator";
import { ProductAnalyticsEventName } from "./product-analytics-event-name.enum";
import { ProductAnalyticsInterceptor } from "./product-analytics.interceptor";

class ProductAnalyticsFixtureController {
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.FEED_READ_REQUEST_SUCCEEDED })
	tracked(): void {}

	@ProductAnalyticsEvent({
		eventName: ProductAnalyticsEventName.AUTH_SESSION_CREATE_REQUEST_SUCCEEDED,
		responseStatusCodes: [201],
	})
	createdOnly(): void {}

	untracked(): void {}
}

function _createExecutionContext(params: {
	handler: () => void;
	request?: FastifyRequest;
	statusCode: number;
}): ExecutionContext {
	return {
		getHandler: () => params.handler,
		switchToHttp: () => ({
			getRequest: () => params.request ?? ({} as FastifyRequest),
			getResponse: () => ({ statusCode: params.statusCode }),
		}),
	} as unknown as ExecutionContext;
}

describe("ProductAnalyticsInterceptor", () => {
	it("should record a registered event after a successful controller outcome", () => {
		const observabilityService = { recordProductAnalyticsEvent: vi.fn() };
		const interceptor = new ProductAnalyticsInterceptor({
			observabilityService: observabilityService as never,
			reflector: new Reflector(),
		});
		const context = _createExecutionContext({
			handler: ProductAnalyticsFixtureController.prototype.tracked,
			statusCode: 200,
		});

		interceptor.intercept(context, { handle: () => of(undefined) } as CallHandler).subscribe();

		expect(observabilityService.recordProductAnalyticsEvent).toHaveBeenCalledWith({
			eventName: ProductAnalyticsEventName.FEED_READ_REQUEST_SUCCEEDED,
		});
	});

	it("should not turn failed controller outcomes into successful product events", () => {
		const observabilityService = { recordProductAnalyticsEvent: vi.fn() };
		const interceptor = new ProductAnalyticsInterceptor({
			observabilityService: observabilityService as never,
			reflector: new Reflector(),
		});
		const context = _createExecutionContext({
			handler: ProductAnalyticsFixtureController.prototype.tracked,
			statusCode: 500,
		});

		interceptor
			.intercept(context, { handle: () => throwError(() => new Error("failed")) } as CallHandler)
			.subscribe({ error: () => undefined });

		expect(observabilityService.recordProductAnalyticsEvent).not.toHaveBeenCalled();
	});

	it.each([HttpRequestTerminationReason.ABORTED, HttpRequestTerminationReason.TIMEOUT])(
		"should not record a successful product request after the HTTP request terminates with %s",
		(terminationReason) => {
			const request = {} as FastifyRequest;
			rememberHttpRequestTermination({ request: request, terminationReason: terminationReason });
			const observabilityService = { recordProductAnalyticsEvent: vi.fn() };
			const interceptor = new ProductAnalyticsInterceptor({
				observabilityService: observabilityService as never,
				reflector: new Reflector(),
			});
			const context = _createExecutionContext({
				handler: ProductAnalyticsFixtureController.prototype.tracked,
				request: request,
				statusCode: 200,
			});

			interceptor.intercept(context, { handle: () => of(undefined) } as CallHandler).subscribe();

			expect(observabilityService.recordProductAnalyticsEvent).not.toHaveBeenCalled();
		},
	);

	it("should ignore controller methods without an analytics contract", () => {
		const observabilityService = { recordProductAnalyticsEvent: vi.fn() };
		const interceptor = new ProductAnalyticsInterceptor({
			observabilityService: observabilityService as never,
			reflector: new Reflector(),
		});
		const context = _createExecutionContext({
			handler: ProductAnalyticsFixtureController.prototype.untracked,
			statusCode: 200,
		});

		interceptor.intercept(context, { handle: () => of(undefined) } as CallHandler).subscribe();

		expect(observabilityService.recordProductAnalyticsEvent).not.toHaveBeenCalled();
	});

	it("should record status-specific conversions only for their declared response status", () => {
		const observabilityService = { recordProductAnalyticsEvent: vi.fn() };
		const interceptor = new ProductAnalyticsInterceptor({
			observabilityService: observabilityService as never,
			reflector: new Reflector(),
		});
		const context = _createExecutionContext({
			handler: ProductAnalyticsFixtureController.prototype.createdOnly,
			statusCode: 202,
		});

		interceptor.intercept(context, { handle: () => of(undefined) } as CallHandler).subscribe();

		expect(observabilityService.recordProductAnalyticsEvent).not.toHaveBeenCalled();
	});
});
