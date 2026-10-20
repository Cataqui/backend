import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { RequestUtils } from "../../shared/utils/request.utils";
import { IRequestSizeConfig } from "../config/request-size.config";
import { ErrorCode } from "../errors/error-code.enum";
import { ApiErrorResponseOutputSchema } from "../errors/api-error-response-output.schema";

function _buildErrorResponse(
	errorCode: ErrorCode,
	message: string,
	status: number,
	request: FastifyRequest,
): z.infer<typeof ApiErrorResponseOutputSchema> {
	return ApiErrorResponseOutputSchema.parse({
		errorCode: errorCode,
		message: message,
		status: status,
		requestId: RequestUtils.resolveRequestId(request),
		timestamp: new Date().toISOString(),
		endpoint: RequestUtils.resolveEndpoint(request),
	});
}

export function registerRequestSizeHooks(app: FastifyInstance, config: IRequestSizeConfig): void {
	app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
		const contentLength = request.headers["content-length"];
		const isContentLengthTooLarge = contentLength !== undefined && Number(contentLength) > config.bodyLimitBytes;
		if (isContentLengthTooLarge) {
			reply
				.code(413)
				.send(
					_buildErrorResponse(
						ErrorCode.PAYLOAD_TOO_LARGE,
						"Request body exceeds the maximum allowed size.",
						413,
						request,
					),
				);
			return;
		}

		const isUrlTooLong = request.url.length > config.urlLengthLimitBytes;
		if (isUrlTooLong) {
			reply
				.code(414)
				.send(
					_buildErrorResponse(ErrorCode.URI_TOO_LONG, "Request URL exceeds the maximum allowed length.", 414, request),
				);
			return;
		}
	});
}
