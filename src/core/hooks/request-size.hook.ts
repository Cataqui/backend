import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { RequestUtils } from "../../shared/utils/request.utils";
import { IRequestSizeConfig } from "../config/request-size.config";
import { ErrorCode } from "../errors/error-code.enum";
import { ErrorOutputSchema, toErrorOutput } from "../errors/error-output";

function _buildErrorResponse(
	errorCode: ErrorCode,
	message: string,
	status: number,
	request: FastifyRequest,
): z.infer<typeof ErrorOutputSchema> {
	return toErrorOutput({
		errorCode: errorCode,
		message: message,
		status: status,
		requestId: RequestUtils.resolveRequestId(request),
		timestamp: new Date().toISOString(),
		endpoint: RequestUtils.resolveEndpoint(request),
	});
}

function _isContentLengthTooLarge(request: FastifyRequest, config: IRequestSizeConfig): boolean {
	const contentLength = request.headers["content-length"];

	if (contentLength === undefined) return false;
	const parsed = Number(contentLength);

	if (Number.isNaN(parsed)) return false;
	return parsed > config.bodyLimitBytes;
}

function _isUrlTooLong(request: FastifyRequest, config: IRequestSizeConfig): boolean {
	return request.url.length > config.urlLengthLimitBytes;
}

export function registerRequestSizeHooks(app: FastifyInstance, config: IRequestSizeConfig): void {
	app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
		if (_isContentLengthTooLarge(request, config)) {
			const body = _buildErrorResponse(
				ErrorCode.PAYLOAD_TOO_LARGE,
				"Request body exceeds the maximum allowed size.",
				413,
				request,
			);
			reply.code(413).send(body);
			return;
		}

		if (_isUrlTooLong(request, config)) {
			const body = _buildErrorResponse(
				ErrorCode.URI_TOO_LONG,
				"Request URL exceeds the maximum allowed length.",
				414,
				request,
			);
			reply.code(414).send(body);
			return;
		}
	});
}
