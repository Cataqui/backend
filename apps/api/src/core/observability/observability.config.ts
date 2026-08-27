import { z } from "zod";
import { ObservabilityConstants } from "./observability.constants";

const _ObservabilityEnvironmentSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "staging", "test"]),
	OBSERVABILITY_TRACE_SAMPLE_RATIO: z.coerce.number().min(0).max(1),
	OTEL_EXPORTER_OTLP_ENDPOINT: z.url(),
	OTEL_EXPORTER_OTLP_HEADERS: z.union([
		z.literal(ObservabilityConstants.OTLP_DISABLED_HEADERS_VALUE),
		z.string().regex(/^dd-api-key=[A-Fa-f0-9]{32}$/),
	]),
	OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: z.literal("delta"),
	OTEL_EXPORTER_OTLP_PROTOCOL: z.literal("http/protobuf"),
	SERVICE_INSTANCE_ID: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
	SERVICE_VERSION: z.string().min(1).max(128),
});

export interface IObservabilityConfig {
	enabled: boolean;
	environment: "development" | "production" | "staging" | "test";
	otlpEndpoint: string;
	serviceInstanceId: string;
	serviceName: string;
	serviceVersion: string;
	traceSampleRatio: number;
}

export function readObservabilityConfig(params: { environment: NodeJS.ProcessEnv }): IObservabilityConfig {
	const environmentWithDevelopmentDefaults =
		params.environment["NODE_ENV"] === "development"
			? {
					OBSERVABILITY_TRACE_SAMPLE_RATIO: "1",
					OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost",
					OTEL_EXPORTER_OTLP_HEADERS: ObservabilityConstants.OTLP_DISABLED_HEADERS_VALUE,
					OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: "delta",
					OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
					SERVICE_INSTANCE_ID: "local-development",
					SERVICE_VERSION: "local",
					...params.environment,
				}
			: params.environment;
	const result = _ObservabilityEnvironmentSchema.safeParse(environmentWithDevelopmentDefaults);
	if (!result.success) {
		throw new Error(
			`Invalid observability configuration:\n${result.error.issues
				.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
				.join("\n")}`,
		);
	}

	const enabled = result.data.OTEL_EXPORTER_OTLP_HEADERS !== ObservabilityConstants.OTLP_DISABLED_HEADERS_VALUE;
	const otlpEndpoint = new URL(result.data.OTEL_EXPORTER_OTLP_ENDPOINT);
	if (enabled && result.data.NODE_ENV !== "development" && result.data.NODE_ENV !== "test") {
		const isApprovedDatadogManagedEndpoint =
			otlpEndpoint.protocol === "https:" &&
			otlpEndpoint.origin === ObservabilityConstants.DATADOG_MANAGED_OTLP_ENDPOINT &&
			otlpEndpoint.pathname === "/" &&
			otlpEndpoint.search === "" &&
			otlpEndpoint.hash === "" &&
			otlpEndpoint.username === "" &&
			otlpEndpoint.password === "";

		if (!isApprovedDatadogManagedEndpoint) {
			throw new Error(
				"OTEL_EXPORTER_OTLP_ENDPOINT must be an approved HTTPS Cloudflare managed-platform endpoint for the attached Datadog site",
			);
		}
	}

	return {
		enabled: enabled,
		environment: result.data.NODE_ENV,
		otlpEndpoint: otlpEndpoint.origin,
		serviceInstanceId: result.data.SERVICE_INSTANCE_ID,
		serviceName: ObservabilityConstants.SERVICE_NAME,
		serviceVersion: result.data.SERVICE_VERSION,
		traceSampleRatio: result.data.OBSERVABILITY_TRACE_SAMPLE_RATIO,
	};
}
