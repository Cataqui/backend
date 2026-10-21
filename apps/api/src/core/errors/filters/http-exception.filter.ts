import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { RequestUtils } from "../../../shared/utils/request.utils";
import { ValidationViolationSchema, type ValidationViolation } from "@cataqui/response";
import { ApiErrorResponseOutputSchema } from "../api-error-response-output.schema";
import { ErrorCode } from "../error-code.enum";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	private readonly _logger = new Logger(HttpExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<FastifyReply>();
		const request = ctx.getRequest<FastifyRequest>();

		const { status, body } = this._resolveError(exception, request);

		this._logger.warn(`${request.method} ${RequestUtils.resolveEndpoint(request)} → ${status} ${body.errorCode}`);

		response.status(status).send(body);
	}

	private _resolveError(
		exception: unknown,
		request: FastifyRequest,
	): { status: HttpStatus; body: z.infer<typeof ApiErrorResponseOutputSchema> } {
		if (exception instanceof HttpException) return this._resolveHttpException(exception, request);

		if (exception instanceof Error) {
			this._logger.error(`Unhandled error: ${exception.message}`, exception.stack);
		}

		return this._buildErrorOutput({
			errorCode: ErrorCode.INTERNAL_ERROR,
			message: "An unexpected error occurred",
			status: HttpStatus.INTERNAL_SERVER_ERROR,
			request: request,
		});
	}

	private _resolveHttpException(
		exception: HttpException,
		request: FastifyRequest,
	): {
		status: HttpStatus;
		body: z.infer<typeof ApiErrorResponseOutputSchema>;
	} {
		const status = exception.getStatus();
		const exceptionResponse = exception.getResponse();

		if (typeof exceptionResponse === "string") {
			const result = this._resolveErrorCodeForStringResponse(exceptionResponse, status);
			return this._buildErrorOutput({
				errorCode: result.errorCode,
				message: result.message,
				status: status,
				request: request,
			});
		}

		if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
			return this._resolveObjectResponse(exceptionResponse as Record<string, unknown>, status, request);
		}

		return this._buildErrorOutput({
			errorCode: ErrorCode.INTERNAL_ERROR,
			message: "An unexpected error occurred",
			status: HttpStatus.INTERNAL_SERVER_ERROR,
			request: request,
		});
	}

	private _resolveErrorCodeForStringResponse(
		message: string,
		status: HttpStatus,
	): { errorCode: ErrorCode; message: string } {
		if (status === HttpStatus.NOT_FOUND && message.startsWith("Cannot")) {
			return { errorCode: ErrorCode.ROUTE_NOT_FOUND, message: "The requested endpoint was not found." };
		}

		if (status === HttpStatus.BAD_REQUEST) {
			return { errorCode: ErrorCode.INVALID_REQUEST, message: message };
		}

		if (status === HttpStatus.UNSUPPORTED_MEDIA_TYPE) {
			return { errorCode: ErrorCode.UNSUPPORTED_MEDIA_TYPE, message: UNSUPPORTED_MEDIA_TYPE_MESSAGE };
		}

		if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
			return { errorCode: ErrorCode.PAYLOAD_TOO_LARGE, message: "Request body exceeds the maximum allowed size." };
		}

		if (status === HttpStatus.URI_TOO_LONG) {
			return { errorCode: ErrorCode.URI_TOO_LONG, message: "Request URL exceeds the maximum allowed length." };
		}

		if (Number(status) === 431) {
			return {
				errorCode: ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE,
				message: "Request header fields exceed the maximum allowed size.",
			};
		}

		return { errorCode: ErrorCode.INTERNAL_ERROR, message: message };
	}

	private _resolveObjectResponse(
		resp: Record<string, unknown>,
		status: HttpStatus,
		request: FastifyRequest,
	): {
		status: HttpStatus;
		body: z.infer<typeof ApiErrorResponseOutputSchema>;
	} {
		const { errorCode, message } = this._resolveErrorCodeFromObject(resp, status);
		const validationViolationsResult = z.array(ValidationViolationSchema).min(1).safeParse(resp["violations"]);

		return this._buildErrorOutput({
			errorCode: errorCode,
			message: message,
			status: status,
			request: request,
			...(validationViolationsResult.success ? { violations: validationViolationsResult.data } : {}),
		});
	}

	private _resolveErrorCodeFromObject(
		resp: Record<string, unknown>,
		status: HttpStatus,
	): { errorCode: ErrorCode; message: string } {
		if (resp["errorCode"] !== undefined) {
			const errorCode = ApiErrorResponseOutputSchema.shape.errorCode.safeParse(resp["errorCode"]);
			if (!errorCode.success) {
				return { errorCode: ErrorCode.INTERNAL_ERROR, message: "An unexpected error occurred" };
			}
			return { errorCode: errorCode.data, message: this._resolveMessage(resp["message"]) };
		}

		if (status === HttpStatus.NOT_FOUND) {
			const rawMessage = resp["message"];

			if (typeof rawMessage === "string" && rawMessage.startsWith("Cannot")) {
				return { errorCode: ErrorCode.ROUTE_NOT_FOUND, message: "The requested endpoint was not found." };
			}

			return { errorCode: ErrorCode.NOT_FOUND, message: this._resolveMessage(rawMessage) };
		}

		if (status === HttpStatus.BAD_REQUEST) {
			return { errorCode: ErrorCode.INVALID_REQUEST, message: this._resolveMessage(resp["message"]) };
		}

		if (status === HttpStatus.UNSUPPORTED_MEDIA_TYPE) {
			return { errorCode: ErrorCode.UNSUPPORTED_MEDIA_TYPE, message: UNSUPPORTED_MEDIA_TYPE_MESSAGE };
		}

		if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
			return { errorCode: ErrorCode.PAYLOAD_TOO_LARGE, message: this._resolveMessage(resp["message"]) };
		}

		if (status === HttpStatus.URI_TOO_LONG) {
			return { errorCode: ErrorCode.URI_TOO_LONG, message: this._resolveMessage(resp["message"]) };
		}

		if (Number(status) === 431) {
			return { errorCode: ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE, message: this._resolveMessage(resp["message"]) };
		}

		return { errorCode: ErrorCode.INTERNAL_ERROR, message: this._resolveMessage(resp["message"]) };
	}

	private _buildErrorOutput(params: {
		errorCode: ErrorCode;
		message: string;
		status: HttpStatus;
		request: FastifyRequest;
		violations?: ValidationViolation[];
	}): {
		status: HttpStatus;
		body: z.infer<typeof ApiErrorResponseOutputSchema>;
	} {
		return {
			status: params.status,
			body: ApiErrorResponseOutputSchema.parse({
				errorCode: params.errorCode,
				message: params.message,
				status: params.status,
				requestId: RequestUtils.resolveRequestId(params.request),
				timestamp: new Date().toISOString(),
				endpoint: RequestUtils.resolveEndpoint(params.request),
				...(params.violations === undefined ? {} : { violations: params.violations }),
			}),
		};
	}

	private _resolveMessage(message: unknown): string {
		if (typeof message === "string") return message;
		if (Array.isArray(message)) return message.join("; ");

		return "An unexpected error occurred";
	}
}

const UNSUPPORTED_MEDIA_TYPE_MESSAGE =
	"Request body media type is unsupported. Send Content-Type: application/json for a JSON body, or omit Content-Type when the request has no body.";
