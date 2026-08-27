import { ObservabilityConstants } from "./observability.constants";
import { readObservabilityConfig } from "./observability.config";

function _createValidObservabilityEnvironment(params: {
	otlpHeaders: string;
	overrides?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
	return {
		NODE_ENV: "production",
		SERVICE_INSTANCE_ID: "container-instance-1",
		SERVICE_VERSION: "0123456789abcdef0123456789abcdef01234567",
		OBSERVABILITY_TRACE_SAMPLE_RATIO: "0.1",
		OTEL_EXPORTER_OTLP_ENDPOINT: "https://cloudflare.integrations.otlp.datadoghq.com",
		OTEL_EXPORTER_OTLP_HEADERS: params.otlpHeaders,
		OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
		OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: "delta",
		...(params.overrides ?? {}),
	};
}

describe("readObservabilityConfig", () => {
	it("should provide the complete local console configuration from development alone", () => {
		const config = readObservabilityConfig({ environment: { NODE_ENV: "development" } });

		expect(config).toEqual({
			enabled: false,
			environment: "development",
			otlpEndpoint: "http://localhost",
			serviceInstanceId: "local-development",
			serviceName: "cataqui-api",
			serviceVersion: "local",
			traceSampleRatio: 1,
		});
	});

	it("should continue requiring explicit observability configuration outside development", () => {
		expect(() => readObservabilityConfig({ environment: { NODE_ENV: "production" } })).toThrow(
			"Invalid observability configuration",
		);
	});

	it("should accept only the managed-platform endpoint for the configured Datadog account", () => {
		const environment = _createValidObservabilityEnvironment({
			otlpHeaders: `dd-api-key=${"a".repeat(32)}`,
		});
		environment["OTEL_EXPORTER_OTLP_ENDPOINT"] = ObservabilityConstants.DATADOG_MANAGED_OTLP_ENDPOINT;

		expect(readObservabilityConfig({ environment: environment }).otlpEndpoint).toBe(
			ObservabilityConstants.DATADOG_MANAGED_OTLP_ENDPOINT,
		);
	});

	it("should keep telemetry disabled until the Datadog runtime key is attached", () => {
		const config = readObservabilityConfig({
			environment: _createValidObservabilityEnvironment({ otlpHeaders: "disabled" }),
		});

		expect(config.enabled).toBe(false);
	});

	it("should enable telemetry when a Datadog OTLP API key header is attached", () => {
		const environment = _createValidObservabilityEnvironment({
			otlpHeaders: `dd-api-key=${"a".repeat(32)}`,
		});

		const config = readObservabilityConfig({ environment: environment });

		expect(config.enabled).toBe(true);
	});

	it.each([`dd-api-key=${"a".repeat(31)}`, `dd-api-key=${"a".repeat(33)}`, `dd-api-key=${"z".repeat(32)}`])(
		"should reject a malformed Datadog runtime API key header",
		(otlpHeaders) => {
			expect(() =>
				readObservabilityConfig({
					environment: _createValidObservabilityEnvironment({ otlpHeaders: otlpHeaders }),
				}),
			).toThrow("OTEL_EXPORTER_OTLP_HEADERS");
		},
	);

	it("should expose only non-secret resource configuration", () => {
		const config = readObservabilityConfig({
			environment: _createValidObservabilityEnvironment({
				otlpHeaders: "disabled",
				overrides: {
					NODE_ENV: "production",
					OBSERVABILITY_TRACE_SAMPLE_RATIO: "0.1",
					OTEL_EXPORTER_OTLP_ENDPOINT: "https://cloudflare.integrations.otlp.datadoghq.com",
					SERVICE_INSTANCE_ID: "container-instance-1",
					SERVICE_VERSION: "0123456789abcdef0123456789abcdef01234567",
				},
			}),
		});

		expect(config).toEqual({
			enabled: false,
			environment: "production",
			otlpEndpoint: "https://cloudflare.integrations.otlp.datadoghq.com",
			serviceInstanceId: "container-instance-1",
			serviceName: "cataqui-api",
			serviceVersion: "0123456789abcdef0123456789abcdef01234567",
			traceSampleRatio: 0.1,
		});
	});

	it("should reject an enabled exporter that does not use HTTPS outside development", () => {
		const environment = _createValidObservabilityEnvironment({
			otlpHeaders: `dd-api-key=${"a".repeat(32)}`,
		});
		environment["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://collector.internal:4318";

		expect(() => readObservabilityConfig({ environment: environment })).toThrow(
			"OTEL_EXPORTER_OTLP_ENDPOINT must be an approved HTTPS Cloudflare managed-platform endpoint for the attached Datadog site",
		);
	});

	it("should reject an enabled exporter sent to an unapproved HTTPS origin", () => {
		const environment = _createValidObservabilityEnvironment({
			otlpHeaders: `dd-api-key=${"a".repeat(32)}`,
		});
		environment["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://collector.example.com";

		expect(() => readObservabilityConfig({ environment: environment })).toThrow(
			"OTEL_EXPORTER_OTLP_ENDPOINT must be an approved HTTPS Cloudflare managed-platform endpoint for the attached Datadog site",
		);
	});

	it.each(["-0.01", "1.01", "not-a-number"])("should reject invalid trace sample ratio %s", (sampleRatio) => {
		const environment = _createValidObservabilityEnvironment({ otlpHeaders: "disabled" });
		environment["OBSERVABILITY_TRACE_SAMPLE_RATIO"] = sampleRatio;

		expect(() => readObservabilityConfig({ environment: environment })).toThrow("OBSERVABILITY_TRACE_SAMPLE_RATIO");
	});

	it("should reject OTLP protocols that the Datadog managed-platform intake does not support", () => {
		const environment = _createValidObservabilityEnvironment({ otlpHeaders: "disabled" });
		environment["OTEL_EXPORTER_OTLP_PROTOCOL"] = "grpc";

		expect(() => readObservabilityConfig({ environment: environment })).toThrow("OTEL_EXPORTER_OTLP_PROTOCOL");
	});

	it("should reject cumulative metric temporality that the Datadog direct intake rejects", () => {
		const environment = _createValidObservabilityEnvironment({ otlpHeaders: "disabled" });
		environment["OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE"] = "cumulative";

		expect(() => readObservabilityConfig({ environment: environment })).toThrow(
			"OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE",
		);
	});
});
