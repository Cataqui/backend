import { Controller, Get } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { configureApp } from "./app.factory";
import { ObservabilityService } from "./observability/observability.service";

@Controller({ path: "observability-cors-probe", version: "1" })
class ObservabilityCorsProbeController {
	@Get()
	getProbe(): { ready: boolean } {
		return { ready: true };
	}
}

describe("configureApp production CORS observability", () => {
	it("should complete one rejected CORS request without leaking the active-request gauge", async () => {
		vi.stubEnv("CORS_ORIGINS", "https://allowed.cataqui.test");
		vi.stubEnv("NODE_ENV", "production");
		const addActiveHttpRequests = vi.fn();
		const recordHttpRequestCompleted = vi.fn();
		const recordHttpRequestTerminated = vi.fn();
		const observabilityService = {
			addActiveHttpRequests: addActiveHttpRequests,
			recordApiError: vi.fn(),
			recordHttpRequestCompleted: recordHttpRequestCompleted,
			recordHttpRequestTerminated: recordHttpRequestTerminated,
			recordProductAnalyticsEvent: vi.fn(),
		} as unknown as ObservabilityService;
		const module = await Test.createTestingModule({
			controllers: [ObservabilityCorsProbeController],
			providers: [{ provide: ObservabilityService, useValue: observabilityService }],
		}).compile();
		const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		let observedResult: unknown;

		try {
			await configureApp(app);
			await app.init();
			const response = await app.inject({
				headers: { origin: "https://rejected.cataqui.test" },
				method: "GET",
				url: "/v1/observability-cors-probe",
			});
			observedResult = {
				activeRequestChanges: addActiveHttpRequests.mock.calls.map(([change]) => change),
				completedRequests: recordHttpRequestCompleted.mock.calls.map(([request]) => request),
				statusCode: response.statusCode,
				terminatedRequestCount: recordHttpRequestTerminated.mock.calls.length,
			};
		} finally {
			await app.close();
			vi.unstubAllEnvs();
		}

		expect(observedResult).toEqual({
			activeRequestChanges: [
				{ delta: 1, route: "/v1/observability-cors-probe" },
				{ delta: -1, route: "/v1/observability-cors-probe" },
			],
			completedRequests: [
				{
					durationSeconds: expect.any(Number),
					method: "GET",
					route: "/v1/observability-cors-probe",
					statusCode: 403,
				},
			],
			statusCode: 403,
			terminatedRequestCount: 0,
		});
	});
});
