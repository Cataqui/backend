import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { DEFAULT_LOCALE } from "../locale/locale.constants";

function resolveRequestId(request: FastifyRequest): string {
	const headerRequestId = request.headers["x-request-id"];
	if (typeof headerRequestId === "string" && headerRequestId.length > 0) return headerRequestId;
	return randomUUID();
}

function resolveEndpoint(request: FastifyRequest): string {
	return request.url;
}

function resolveRequestLocale(acceptLanguage: string | undefined): string {
	if (!acceptLanguage) return DEFAULT_LOCALE;

	const locales = acceptLanguage.split(",").map((part) => (part.split(";")[0] ?? "").trim());

	return locales[0] ?? DEFAULT_LOCALE;
}

export const RequestUtils = {
	resolveRequestId,
	resolveEndpoint,
	resolveRequestLocale,
} as const;
