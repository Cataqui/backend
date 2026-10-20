import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { InvalidLocaleException } from "../../core/errors/invalid-locale.exception";
import { LocaleConstants } from "../locale/locale.constants";
import { LocaleUtils } from "../locale/locale.utils";

function resolveRequestId(request: FastifyRequest): string {
	const headerRequestId = request.headers["x-request-id"];
	if (typeof headerRequestId === "string" && headerRequestId.length > 0) return headerRequestId;
	return randomUUID();
}

function resolveEndpoint(request: FastifyRequest): string {
	return request.url.split("?", 1)[0] ?? request.url;
}

function resolveRequestLocale(acceptLanguage: string | undefined): string {
	if (!acceptLanguage) return LocaleConstants.DEFAULT_LOCALE;

	const primary = acceptLanguage.split(",").map((part) => (part.split(";")[0] ?? "").trim())[0] ?? "";

	if (primary.length > 0 && !/^[a-z]{2}(-[a-z0-9]{2,8})?$/i.test(primary)) throw new InvalidLocaleException(primary);

	return LocaleUtils.formatBcp47LocaleTag(primary) || LocaleConstants.DEFAULT_LOCALE;
}

export const RequestUtils = {
	resolveRequestId: resolveRequestId,
	resolveEndpoint: resolveEndpoint,
	resolveRequestLocale: resolveRequestLocale,
} as const;
