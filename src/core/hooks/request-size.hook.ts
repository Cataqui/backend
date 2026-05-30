import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { instanceToPlain } from "class-transformer";
import { IRequestSizeConfig } from "../config/request-size.config";
import { ErrorCode } from "../errors/error-code.enum";
import { ErrorOutputDto } from "../errors/error-output.dto";
import { RequestUtils } from "../../shared/utils/request.utils";

function _buildErrorResponse(errorCode: ErrorCode, message: string, status: number, request: FastifyRequest): Record<string, unknown> {
	const dto = new ErrorOutputDto(errorCode, message, status, RequestUtils.resolveRequestId(request), new Date().toISOString(), RequestUtils.resolveEndpoint(request));
	return instanceToPlain(dto, { exposeUnsetFields: false });
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
			const body = _buildErrorResponse(ErrorCode.PAYLOAD_TOO_LARGE, "Request body exceeds the maximum allowed size.", 413, request);
			reply.code(413).send(body);
			return;
		}

		if (_isUrlTooLong(request, config)) {
			const body = _buildErrorResponse(ErrorCode.URI_TOO_LONG, "Request URL exceeds the maximum allowed length.", 414, request);
			reply.code(414).send(body);
			return;
		}
	});
}
