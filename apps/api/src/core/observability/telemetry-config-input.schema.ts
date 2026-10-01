import { z } from "zod";

export const TelemetryConfigInputSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "staging", "test"]),
	DATADOG_API_KEY: z.string().min(1, "DATADOG_API_KEY must be a Datadog API key, for example 0123456789abcdef"),
	DATADOG_OTLP_ENDPOINT: z
		.url({
			protocol: /^https$/,
			error:
				"DATADOG_OTLP_ENDPOINT must be an https URL, for example https://cloudflare.integrations.otlp.us5.datadoghq.com",
		})
		.transform((endpoint) => endpoint.replace(/\/+$/, "")),
	SERVICE_VERSION: z.string().min(1).default("unknown"),
});
