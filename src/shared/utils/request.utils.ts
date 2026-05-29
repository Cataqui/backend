import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";

function resolveRequestId(request: FastifyRequest): string {
	const headerRequestId = request.headers["x-request-id"];
	if (typeof headerRequestId === "string" && headerRequestId.length > 0) return headerRequestId;
	return randomUUID();
}

function resolveEndpoint(request: FastifyRequest): string {
	return request.url;
}

export const RequestUtils = {
	resolveRequestId,
	resolveEndpoint,
} as const;
