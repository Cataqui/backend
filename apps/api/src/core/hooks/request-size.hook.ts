import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { RequestUtils } from "../../shared/utils/request.utils";
import { IRequestSizeConfig } from "../config/request-size.config";
import { ErrorCode } from "../errors/error-code.enum";
import { ErrorOutputSchema, toErrorOutput } from "../errors/error-output";
import { ApiErrorOrigin } from "../observability/api-error-origin.enum";
import type { ObservabilityService } from "../observability/observability.service";

function _buildErrorResponse(params: {
	errorCode: ErrorCode;
	message: string;
	request: FastifyRequest;
	status: number;
}): z.infer<typeof ErrorOutputSchema> {
	return toErrorOutput({
		errorCode: params.errorCode,
		message: params.message,
		status: params.status,
		requestId: RequestUtils.getOrCreateRequestId(params.request),
		timestamp: new Date().toISOString(),
		endpoint: RequestUtils.getPathWithoutQuery(params.request),
	});
}

function _isContentLengthTooLarge(params: { config: IRequestSizeConfig; request: FastifyRequest }): boolean {
	const contentLength = params.request.headers["content-length"];

	if (contentLength === undefined) return false;
	const parsed = Number(contentLength);

	if (Number.isNaN(parsed)) return false;
	return parsed > params.config.bodyLimitBytes;
}

function _isUrlTooLong(params: { config: IRequestSizeConfig; request: FastifyRequest }): boolean {
	return params.request.url.length > params.config.urlLengthLimitBytes;
}

export function registerRequestSizeHooks(params: {
	config: IRequestSizeConfig;
	fastifyInstance: FastifyInstance;
	observabilityService: ObservabilityService;
}): void {
	params.fastifyInstance.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
		if (_isContentLengthTooLarge({ config: params.config, request: request })) {
			const body = _buildErrorResponse({
				errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
				message: "Request body exceeds the maximum allowed size.",
				request: request,
				status: 413,
			});
			params.observabilityService.recordApiError({
				errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
				method: request.method,
				origin: ApiErrorOrigin.CLIENT,
				route: RequestUtils.getNormalizedRouteTemplate(request),
				statusCode: 413,
			});
			reply.code(413).send(body);
			return;
		}

		if (_isUrlTooLong({ config: params.config, request: request })) {
			const body = _buildErrorResponse({
				errorCode: ErrorCode.URI_TOO_LONG,
				message: "Request URL exceeds the maximum allowed length.",
				request: request,
				status: 414,
			});
			params.observabilityService.recordApiError({
				errorCode: ErrorCode.URI_TOO_LONG,
				method: request.method,
				origin: ApiErrorOrigin.CLIENT,
				route: RequestUtils.getNormalizedRouteTemplate(request),
				statusCode: 414,
			});
			reply.code(414).send(body);
			return;
		}
	});
}
