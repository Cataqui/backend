import { request as createHttpRequest } from "node:http";
import { Controller, Get } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { registerHttpObservabilityHooks } from "../src/core/observability/http-observability.hook";
import { ObservabilityService } from "../src/core/observability/observability.service";
import { ProductAnalyticsEventName } from "../src/core/observability/product-analytics-event-name.enum";
import { ProductAnalyticsEvent } from "../src/core/observability/product-analytics-event.decorator";
import { ProductAnalyticsInterceptor } from "../src/core/observability/product-analytics.interceptor";

let _completeDelayedRequest: (() => void) | undefined;
let _reportDelayedRequestStarted: (() => void) | undefined;
let _delayedRequestCanComplete = Promise.resolve();

@Controller("product-analytics-abort")
class ProductAnalyticsAbortTestController {
	@Get()
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.FEED_READ_REQUEST_SUCCEEDED })
	async completeAfterClientDisconnects(): Promise<{ ok: true }> {
		_reportDelayedRequestStarted?.();
		await _delayedRequestCanComplete;
		return { ok: true };
	}
}

describe("Product analytics after an aborted HTTP request (e2e)", () => {
	it("should not record a successful product request when the controller finishes after the client disconnects", async () => {
		let reportRequestStarted: (() => void) | undefined;
		const requestStarted = new Promise<void>((resolve) => {
			reportRequestStarted = resolve;
		});
		_reportDelayedRequestStarted = reportRequestStarted;
		_delayedRequestCanComplete = new Promise<void>((resolve) => {
			_completeDelayedRequest = resolve;
		});
		let reportRequestTerminated: (() => void) | undefined;
		const requestTerminated = new Promise<void>((resolve) => {
			reportRequestTerminated = resolve;
		});
		const observabilityService = {
			addActiveHttpRequests: vi.fn(),
			recordHttpRequestCompleted: vi.fn(),
			recordHttpRequestTerminated: vi.fn(() => reportRequestTerminated?.()),
			recordProductAnalyticsEvent: vi.fn(),
		};
		const module = await Test.createTestingModule({
			controllers: [ProductAnalyticsAbortTestController],
			providers: [{ provide: ObservabilityService, useValue: observabilityService }],
		}).compile();
		const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		app.useGlobalInterceptors(
			new ProductAnalyticsInterceptor({
				observabilityService: observabilityService as never,
				reflector: app.get(Reflector),
			}),
		);
		registerHttpObservabilityHooks({
			fastifyInstance: app.getHttpAdapter().getInstance(),
			observabilityService: observabilityService as never,
		});
		await app.init();
		await app.listen(0, "127.0.0.1");
		const endpoint = new URL("/product-analytics-abort", await app.getUrl());
		const request = createHttpRequest({
			host: endpoint.hostname,
			method: "GET",
			path: endpoint.pathname,
			port: Number(endpoint.port),
		});
		request.on("error", () => undefined);
		request.end();

		await requestStarted;
		request.destroy();
		await requestTerminated;
		_completeDelayedRequest?.();
		await new Promise((resolve) => setTimeout(resolve, 25));
		await app.close();

		expect({
			productAnalyticsEventCalls: observabilityService.recordProductAnalyticsEvent.mock.calls.length,
			terminatedRequestCalls: observabilityService.recordHttpRequestTerminated.mock.calls.length,
		}).toEqual({ productAnalyticsEventCalls: 0, terminatedRequestCalls: 1 });
	});
});
