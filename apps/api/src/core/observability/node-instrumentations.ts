import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { SpanStatusCode } from "@opentelemetry/api";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";
import { findHttpRequestTerminationReason, rememberHttpRequestTermination } from "./http-request-termination.store";
import { getHttpRouteTelemetry } from "./http-route-telemetry.store";

export function createNodeInstrumentations(params: { redactSensitiveHttpAttributes: boolean }): Instrumentation[] {
	return [
		...getNodeAutoInstrumentations({
			"@opentelemetry/instrumentation-fs": { enabled: false },
			"@opentelemetry/instrumentation-http": {
				applyCustomAttributesOnSpan: (span, request) => {
					const routeTelemetry = getHttpRouteTelemetry({ rawRequest: request });
					if (routeTelemetry !== undefined) {
						span.updateName(`${routeTelemetry.method} ${routeTelemetry.route}`);
						span.setAttribute("http.route", routeTelemetry.route);
					}

					const terminationReason = findHttpRequestTerminationReason({ request: request });
					if (terminationReason === undefined) return;

					span.setAttribute("cataqui.http.outcome", terminationReason);
					span.setStatus({
						code:
							terminationReason === HttpRequestTerminationReason.TIMEOUT ? SpanStatusCode.ERROR : SpanStatusCode.UNSET,
					});
				},
				requestHook: (span, request) => {
					if (params.redactSensitiveHttpAttributes) {
						span.setAttributes({
							"client.address": "[REDACTED]",
							"network.peer.address": "[REDACTED]",
							"network.peer.port": 0,
							"url.full": "[REDACTED]",
							"url.path": "[REDACTED]",
							"url.query": "[REDACTED]",
							"user_agent.original": "[REDACTED]",
						});
					}
					if (!("complete" in request)) return;

					request.once("aborted", () => {
						rememberHttpRequestTermination({
							request: request,
							terminationReason: HttpRequestTerminationReason.ABORTED,
						});
					});
				},
				redactedQueryParams: params.redactSensitiveHttpAttributes
					? [
							"access_token",
							"api_key",
							"apikey",
							"authorization",
							"code",
							"cursor",
							"password",
							"refreshToken",
							"refresh_token",
							"sig",
							"signature",
							"token",
						]
					: [],
			},
			"@opentelemetry/instrumentation-pino": {
				enabled: false,
			},
		}),
		new PrismaInstrumentation(),
	];
}
