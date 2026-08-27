import { getHttpRouteTelemetry, rememberHttpRouteTelemetry } from "./http-route-telemetry.store";

describe("HTTP route telemetry store", () => {
	it("should correlate one raw HTTP request with its normalized route template", () => {
		const rawRequest = {};
		rememberHttpRouteTelemetry({ method: "GET", rawRequest: rawRequest, route: "/v1/jobs/:jobId" });

		expect(getHttpRouteTelemetry({ rawRequest: rawRequest })).toEqual({
			method: "GET",
			route: "/v1/jobs/:jobId",
		});
	});

	it("should not invent route metadata for an unknown raw request", () => {
		expect(getHttpRouteTelemetry({ rawRequest: {} })).toBeUndefined();
	});
});
