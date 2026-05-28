import type { FastifyReply, FastifyRequest } from "fastify";
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ErrorCode } from "./error-code.enum";
import { ErrorOutputDto } from "./error-output.dto";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	private readonly _logger = new Logger(HttpExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<FastifyReply>();
		const request = ctx.getRequest<FastifyRequest>();

		const { status, body } = this._resolveError(exception);

		this._logger.warn(`${request.method} ${request.url} → ${status} ${body.errorCode}`);

		response.status(status).send(body);
	}

	private _resolveError(exception: unknown): { status: HttpStatus; body: ErrorOutputDto } {
		if (exception instanceof HttpException) return this._resolveHttpException(exception);

		if (exception instanceof Error) {
			this._logger.error(`Unhandled error: ${exception.message}`, exception.stack);
		}

		return {
			status: HttpStatus.INTERNAL_SERVER_ERROR,
			body: new ErrorOutputDto(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred"),
		};
	}

	private _resolveHttpException(exception: HttpException): {
		status: HttpStatus;
		body: ErrorOutputDto;
	} {
		const status = exception.getStatus();
		const exceptionResponse = exception.getResponse();

		if (typeof exceptionResponse === "string") {
			return { status, body: new ErrorOutputDto(ErrorCode.INTERNAL_ERROR, exceptionResponse) };
		}

		if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
			return {
				status,
				body: this._parseExceptionBody(exceptionResponse as Record<string, unknown>),
			};
		}

		return {
			status,
			body: new ErrorOutputDto(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred"),
		};
	}

	private _parseExceptionBody(resp: Record<string, unknown>): ErrorOutputDto {
		const errorCode = typeof resp["error_code"] === "string" ? (resp["error_code"] as ErrorCode) : ErrorCode.INTERNAL_ERROR;

		const message = this._resolveMessage(resp["message"]);

		return new ErrorOutputDto(errorCode, message);
	}

	private _resolveMessage(message: unknown): string {
		if (typeof message === "string") return message;
		if (Array.isArray(message)) return message.join("; ");

		return "An unexpected error occurred";
	}
}
