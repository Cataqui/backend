import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from "@nestjs/common";
import { instanceToPlain } from "class-transformer";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../../generated/prisma/client.js";
import { RequestUtils } from "../../../shared/utils/request.utils";
import { ErrorCode } from "../../errors/error-code.enum.js";
import { ErrorOutputDto } from "../../errors/error-output.dto.js";

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

	private _sanitizeMeta(meta: unknown): Record<string, unknown> | undefined {
		if (!meta || typeof meta !== "object") return undefined;

		const safeKeys = ["target", "field_name", "modelName"];
		const sanitized: Record<string, unknown> = {};
		const metaRecord = meta as Record<string, unknown>;
		for (const key of safeKeys) if (key in metaRecord) sanitized[key] = metaRecord[key];

		return sanitized;
	}

	catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<FastifyReply>();
		const request = ctx.getRequest<FastifyRequest>();

		const mapping = PRISMA_ERROR_MAP[exception.code];
		const sanitizedMeta = this._sanitizeMeta(exception.meta);

		const logMetadata = {
			code: exception.code,
			meta: sanitizedMeta,
			method: request.method,
			url: request.url,
			message: exception.message,
		};

		if (mapping) {
			this._logger.warn(
				`Prisma error ${exception.code} on ${request.method} ${request.url} - Meta: ${JSON.stringify(sanitizedMeta)}`,
			);
		} else {
			this._logger.error(
				`Unhandled Prisma database error ${exception.code} on ${request.method} ${request.url}`,
				exception.stack,
				JSON.stringify(logMetadata),
			);
		}

		const status = mapping?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
		const errorCode = mapping?.code ?? ErrorCode.INTERNAL_ERROR;
		const userMessage = mapping?.message ?? "An unexpected database error occurred.";

		const body = new ErrorOutputDto(
			errorCode,
			userMessage,
			status,
			RequestUtils.resolveRequestId(request),
			new Date().toISOString(),
			RequestUtils.resolveEndpoint(request),
		);

		response.status(status).send(instanceToPlain(body));
	}
}
