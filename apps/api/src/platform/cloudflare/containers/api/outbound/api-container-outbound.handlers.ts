import type { OutboundHandler } from "@cloudflare/containers";
import {
	getSourceSafeErrorTelemetryFields,
	getWorkerVersion,
	ObservabilityEventConstants,
} from "@cataqui/observability-contracts";
import { z } from "zod";
import { type ApiContainerOutboundHost, apiContainerOutboundManifest } from "./api-container-outbound.manifest";

function _getTraceIdFromTraceparent(params: { traceparent: string | null }): string | undefined {
	const traceId = params.traceparent?.match(/^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i)?.[1]?.toLowerCase();
	if (traceId === undefined || traceId === "0".repeat(32)) return undefined;
	return traceId;
}

function _createOutboundHandler<BodySchema extends z.ZodType>(params: {
	definition: {
		bodySchema: BodySchema;
		execute: (params: { body: z.output<BodySchema>; environment: ApiWorkerEnv }) => Promise<void>;
	};
	outboundHost: ApiContainerOutboundHost;
}): OutboundHandler<ApiWorkerEnv> {
	return async (request, environment) => {
		const operationStartedAt = performance.now();
		const workerServiceName = `cataqui-api-${environment.NODE_ENV}`;
		const workerServiceVersion = getWorkerVersion({ metadata: environment.WORKER_VERSION_METADATA });
		const traceId = _getTraceIdFromTraceparent({ traceparent: request.headers.get("traceparent") });
		const lifecycleLogFields = {
			env: environment.NODE_ENV,
			outboundHost: params.outboundHost,
			service: workerServiceName,
			...(traceId === undefined ? {} : { trace_id: traceId }),
			version: workerServiceVersion,
		};

		if (request.method !== "POST") {
			console.warn({
				...lifecycleLogFields,
				durationMilliseconds: performance.now() - operationStartedAt,
				event: ObservabilityEventConstants.API_WORKER_OUTBOUND_CALL_REJECTED_EVENT,
				outcome: "REJECTED",
				responseStatus: 405,
			});
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		let requestBody: unknown;

		try {
			requestBody = await request.json();
		} catch {
			console.warn({
				...lifecycleLogFields,
				durationMilliseconds: performance.now() - operationStartedAt,
				event: ObservabilityEventConstants.API_WORKER_OUTBOUND_CALL_REJECTED_EVENT,
				outcome: "REJECTED",
				responseStatus: 400,
			});
			return new Response(null, { status: 400 });
		}

		const bodyResult = params.definition.bodySchema.safeParse(requestBody);
		if (!bodyResult.success) {
			console.warn({
				...lifecycleLogFields,
				durationMilliseconds: performance.now() - operationStartedAt,
				event: ObservabilityEventConstants.API_WORKER_OUTBOUND_CALL_REJECTED_EVENT,
				outcome: "REJECTED",
				responseStatus: 400,
			});
			return new Response(null, { status: 400 });
		}

		try {
			await params.definition.execute({ body: bodyResult.data, environment: environment });
		} catch (error) {
			console.error({
				...lifecycleLogFields,
				durationMilliseconds: performance.now() - operationStartedAt,
				...getSourceSafeErrorTelemetryFields({ error: error }),
				event: ObservabilityEventConstants.API_WORKER_OUTBOUND_CALL_FAILED_EVENT,
				outcome: "THREW",
				responseStatus: 503,
			});
			return new Response(null, { status: 503 });
		}

		console.log({
			...lifecycleLogFields,
			durationMilliseconds: performance.now() - operationStartedAt,
			event: ObservabilityEventConstants.API_WORKER_OUTBOUND_CALL_COMPLETED_EVENT,
			outcome: "SUCCESS",
			responseStatus: 204,
		});

		return new Response(null, { status: 204 });
	};
}

export const apiContainerOutboundHandlers = Object.fromEntries(
	Object.entries(apiContainerOutboundManifest).map(([outboundHost, definition]) => [
		outboundHost,
		_createOutboundHandler({ definition: definition, outboundHost: outboundHost as ApiContainerOutboundHost }),
	]),
) as Record<ApiContainerOutboundHost, OutboundHandler<ApiWorkerEnv>>;
