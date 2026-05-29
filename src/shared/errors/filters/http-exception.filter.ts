import type { FastifyReply, FastifyRequest } from "fastify";
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { instanceToPlain } from "class-transformer";
import { ErrorCode } from "../error-code.enum";
import { ErrorOutputDto } from "../error-output.dto";
import { RequestUtils } from "../../utils/request.utils";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	private readonly _logger = new Logger(HttpExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<FastifyReply>();
		const request = ctx.getRequest<FastifyRequest>();

		const { status, body } = this._resolveError(exception, request);

		this._logger.warn(`${request.method} ${request.url} → ${status} ${body.errorCode}`);

		response.status(status).send(instanceToPlain(body));
	}

	private _resolveError(exception: unknown, request: FastifyRequest): { status: HttpStatus; body: ErrorOutputDto } {
		if (exception instanceof HttpException) return this._resolveHttpException(exception, request);

		if (exception instanceof Error) {
			this._logger.error(`Unhandled error: ${exception.message}`, exception.stack);
		}

		return this._buildErrorOutput(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred", HttpStatus.INTERNAL_SERVER_ERROR, request);
	}

	private _resolveHttpException(
		exception: HttpException,
		request: FastifyRequest,
	): {
		status: HttpStatus;
		body: ErrorOutputDto;
	} {
		const status = exception.getStatus();
		const exceptionResponse = exception.getResponse();

		if (typeof exceptionResponse === "string") {
			const result = this._resolveErrorCodeForStringResponse(exceptionResponse, status);
			return this._buildErrorOutput(result.errorCode, result.message, status, request);
		}

		if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
			return this._resolveObjectResponse(exceptionResponse as Record<string, unknown>, status, request);
		}

		return this._buildErrorOutput(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred", HttpStatus.INTERNAL_SERVER_ERROR, request);
	}

	private _resolveErrorCodeForStringResponse(message: string, status: HttpStatus): { errorCode: ErrorCode; message: string } {
		if (status === HttpStatus.NOT_FOUND && message.startsWith("Cannot")) {
			return { errorCode: ErrorCode.ROUTE_NOT_FOUND, message: "The requested endpoint was not found." };
		}

		if (status === HttpStatus.BAD_REQUEST) {
			return { errorCode: ErrorCode.INVALID_REQUEST, message };
		}

		return { errorCode: ErrorCode.INTERNAL_ERROR, message };
	}

	private _resolveObjectResponse(
		resp: Record<string, unknown>,
		status: HttpStatus,
		request: FastifyRequest,
	): {
		status: HttpStatus;
		body: ErrorOutputDto;
	} {
		const { errorCode, message } = this._resolveErrorCodeFromObject(resp, status);

		return this._buildErrorOutput(errorCode, message, status, request);
	}

	private _resolveErrorCodeFromObject(resp: Record<string, unknown>, status: HttpStatus): { errorCode: ErrorCode; message: string } {
		if (typeof resp["error_code"] === "string") {
			return { errorCode: resp["error_code"] as ErrorCode, message: this._resolveMessage(resp["message"]) };
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

		return { errorCode: ErrorCode.INTERNAL_ERROR, message: this._resolveMessage(resp["message"]) };
	}

	private _buildErrorOutput(
		errorCode: ErrorCode,
		message: string,
		status: HttpStatus,
		request: FastifyRequest,
	): {
		status: HttpStatus;
		body: ErrorOutputDto;
	} {
		return {
			status,
			body: new ErrorOutputDto(errorCode, message, status, RequestUtils.resolveRequestId(request), new Date().toISOString(), RequestUtils.resolveEndpoint(request)),
		};
	}

	private _resolveMessage(message: unknown): string {
		if (typeof message === "string") return message;
		if (Array.isArray(message)) return message.join("; ");

		return "An unexpected error occurred";
	}
}
