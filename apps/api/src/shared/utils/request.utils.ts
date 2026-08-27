import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { InvalidLocaleException } from "../../core/errors/invalid-locale.exception";
import { LocaleConstants } from "../locale/locale.constants";
import { LocaleUtils } from "../locale/locale.utils";

function getOrCreateRequestId(request: FastifyRequest): string {
	const headerRequestId = request.headers["x-request-id"];
	if (typeof headerRequestId === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(headerRequestId)) {
		return headerRequestId;
	}

	const generatedRequestId = randomUUID();
	request.headers["x-request-id"] = generatedRequestId;
	return generatedRequestId;
}

function getPathWithoutQuery(request: FastifyRequest): string {
	return request.url.split("?", 1)[0] ?? request.url;
}

function getNormalizedRouteTemplate(request: FastifyRequest): string {
	return request.routeOptions?.url ?? "UNMATCHED";
}

function resolveRequestLocale(acceptLanguage: string | undefined): string {
	if (!acceptLanguage) return LocaleConstants.DEFAULT_LOCALE;

	const locales = acceptLanguage.split(",").map((part) => (part.split(";")[0] ?? "").trim());
	const primary = locales[0] ?? "";

	if (primary.length > 0 && !LocaleConstants.LOCALE_TAG_REGEX.test(primary)) throw new InvalidLocaleException(primary);

	return LocaleUtils.formatBcp47LocaleTag(primary) || LocaleConstants.DEFAULT_LOCALE;
}

export const RequestUtils = {
	getNormalizedRouteTemplate: getNormalizedRouteTemplate,
	getOrCreateRequestId: getOrCreateRequestId,
	getPathWithoutQuery: getPathWithoutQuery,
	resolveRequestLocale: resolveRequestLocale,
} as const;
