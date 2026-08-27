import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from "@nestjs/common";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../../generated/prisma/client.js";
import { RequestUtils } from "../../../shared/utils/request.utils";
import { ErrorCode } from "../../errors/error-code.enum.js";
import { toErrorOutput } from "../../errors/error-output.js";
import { ApiErrorOrigin } from "../../observability/api-error-origin.enum.js";
import type { ObservabilityService } from "../../observability/observability.service.js";
import { getDevelopmentErrorLogFields, getSafeErrorTelemetryFields } from "../../observability/safe-error-telemetry.js";

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
	private readonly _observabilityService: Pick<ObservabilityService, "recordApiError">;

	constructor(params: { observabilityService: Pick<ObservabilityService, "recordApiError"> }) {
		this._observabilityService = params.observabilityService;
	}

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
		const route = RequestUtils.getNormalizedRouteTemplate(request);
		const status = mapping?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
		const errorCode = mapping?.code ?? ErrorCode.INTERNAL_ERROR;
		const logFields = {
			errorCode: errorCode,
			event: ObservabilityEventConstants.API_DATABASE_REQUEST_FAILED_EVENT,
			metadata: sanitizedMeta,
			method: request.method,
			prismaCode: exception.code,
			requestId: RequestUtils.getOrCreateRequestId(request),
			route: route,
			statusCode: status,
		};

		if (mapping) {
			this._logger.warn(logFields);
		} else {
			this._logger.error({
				...logFields,
				...getSafeErrorTelemetryFields({ error: exception }),
				...(process.env["NODE_ENV"] === "development" ? getDevelopmentErrorLogFields({ error: exception }) : {}),
			});
		}

		this._observabilityService.recordApiError({
			errorCode: errorCode,
			exception: exception,
			method: request.method,
			origin: status >= HttpStatus.INTERNAL_SERVER_ERROR ? ApiErrorOrigin.SERVER : ApiErrorOrigin.CLIENT,
			route: route,
			statusCode: status,
		});
		const userMessage = mapping?.message ?? "An unexpected database error occurred.";

		const body = toErrorOutput({
			errorCode: errorCode,
			message: userMessage,
			status: status,
			requestId: RequestUtils.getOrCreateRequestId(request),
			timestamp: new Date().toISOString(),
			endpoint: RequestUtils.getPathWithoutQuery(request),
		});

		response.status(status).send(body);
	}
}
