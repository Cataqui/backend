import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { DEFAULT_LOCALE, LOCALE_TAG_REGEX } from "../locale/locale.constants";
import { InvalidLocaleException } from "../errors/invalid-locale.exception";

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
	const primary = locales[0] ?? "";

	if (primary.length > 0 && !LOCALE_TAG_REGEX.test(primary)) throw new InvalidLocaleException(primary);

	return primary || DEFAULT_LOCALE;
}

export const RequestUtils = {
	resolveRequestId,
	resolveEndpoint,
	resolveRequestLocale,
} as const;
