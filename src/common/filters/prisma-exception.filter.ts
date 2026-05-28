import type { FastifyReply, FastifyRequest } from "fastify";
import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import { ErrorCode } from "../errors/error-code.enum";
import { ErrorOutputDto } from "../errors/error-output.dto";

const PRISMA_ERROR_MAP: Record<
	string,
	{
		code: ErrorCode;
		status: HttpStatus;
		message: string;
	}
> = {
	P2002: {
		code: ErrorCode.VALIDATION_ERROR,
		status: HttpStatus.CONFLICT,
		message: "The resource you are trying to create or update already exists.",
	},
	P2003: {
		code: ErrorCode.VALIDATION_ERROR,
		status: HttpStatus.BAD_REQUEST,
		message: "The requested operation references a record that does not exist.",
	},
	P2025: {
		code: ErrorCode.NOT_FOUND,
		status: HttpStatus.NOT_FOUND,
		message: "The requested record was not found or could not be accessed.",
	},
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
	private readonly _logger = new Logger(PrismaExceptionFilter.name);

	catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<FastifyReply>();
		const request = ctx.getRequest<FastifyRequest>();

		const mapping = PRISMA_ERROR_MAP[exception.code];

		const logMetadata = {
			code: exception.code,
			meta: exception.meta,
			method: request.method,
			url: request.url,
			message: exception.message,
		};

		if (mapping) {
			this._logger.warn(`Prisma error ${exception.code} on ${request.method} ${request.url} - Meta: ${JSON.stringify(exception.meta)}`);
		} else {
			this._logger.error(`Unhandled Prisma database error ${exception.code} on ${request.method} ${request.url}`, exception.stack, JSON.stringify(logMetadata));
		}

		const status = mapping?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
		const errorCode = mapping?.code ?? ErrorCode.INTERNAL_ERROR;
		const userMessage = mapping?.message ?? "An unexpected database error occurred.";

		const body = new ErrorOutputDto(errorCode, userMessage);

		response.status(status).send(body);
	}
}
