import { context as telemetryContext, trace } from "@opentelemetry/api";
import { logs, type LogAttributes, type Logger, SeverityNumber } from "@opentelemetry/api-logs";
import type { LoggerService } from "@nestjs/common";
import pino, { type Logger as PinoLogger } from "pino";
import { getSafeErrorTelemetryFields } from "./safe-error-telemetry";

enum StructuredLogLevel {
	DEBUG = "DEBUG",
	ERROR = "ERROR",
	FATAL = "FATAL",
	INFO = "INFO",
	TRACE = "TRACE",
	WARN = "WARN",
}

const _SAFE_TELEMETRY_LOG_ATTRIBUTE_NAMES = new Set([
	"acknowledgedMessageCount",
	"context",
	"durationMilliseconds",
	"errorCode",
	"errorName",
	"errorStackFrames",
	"event",
	"exitCode",
	"invalidMessageCount",
	"messageCount",
	"method",
	"outcome",
	"prismaCode",
	"queue",
	"reason",
	"requestId",
	"responseStatus",
	"retriedMessageCount",
	"route",
	"sleepAfter",
	"status",
	"statusCode",
]);

function _isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class StructuredLogger implements LoggerService {
	private readonly _includeFullDetails: boolean;
	private readonly _logger: PinoLogger;
	private readonly _telemetryLogger: Logger;

	constructor(params: { includeFullDetails: boolean; logger: PinoLogger; telemetryLogger: Logger }) {
		this._includeFullDetails = params.includeFullDetails;
		this._logger = params.logger;
		this._telemetryLogger = params.telemetryLogger;
	}

	log(message: unknown, ...optionalParams: unknown[]): void {
		this._write({ level: StructuredLogLevel.INFO, message: message, optionalParams: optionalParams });
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		this._write({ level: StructuredLogLevel.ERROR, message: message, optionalParams: optionalParams });
	}

	warn(message: unknown, ...optionalParams: unknown[]): void {
		this._write({ level: StructuredLogLevel.WARN, message: message, optionalParams: optionalParams });
	}

	debug(message: unknown, ...optionalParams: unknown[]): void {
		this._write({ level: StructuredLogLevel.DEBUG, message: message, optionalParams: optionalParams });
	}

	verbose(message: unknown, ...optionalParams: unknown[]): void {
		this._write({ level: StructuredLogLevel.TRACE, message: message, optionalParams: optionalParams });
	}

	fatal(message: unknown, ...optionalParams: unknown[]): void {
		this._write({ level: StructuredLogLevel.FATAL, message: message, optionalParams: optionalParams });
	}

	private _write(params: { level: StructuredLogLevel; message: unknown; optionalParams: unknown[] }): void {
		const lastOptionalParam = params.optionalParams.at(-1);
		const context = typeof lastOptionalParam === "string" ? lastOptionalParam : undefined;
		const errorStackCandidate = params.optionalParams.length >= 2 ? params.optionalParams[0] : undefined;
		const errorStack =
			typeof errorStackCandidate === "string" && errorStackCandidate !== context ? errorStackCandidate : undefined;
		const structuredFields = _isRecord(params.message) ? params.message : {};
		const error = params.message instanceof Error ? params.message : undefined;
		const safeErrorFields =
			error === undefined && errorStack === undefined
				? {}
				: getSafeErrorTelemetryFields({
						error: error,
						...(errorStack === undefined ? {} : { errorStack: errorStack }),
					});
		const fields = {
			...structuredFields,
			...(context === undefined ? {} : { context: context }),
			...safeErrorFields,
		};
		const telemetryAttributes: LogAttributes = {};
		for (const [attributeName, attributeValue] of Object.entries(fields)) {
			if (!_SAFE_TELEMETRY_LOG_ATTRIBUTE_NAMES.has(attributeName)) continue;
			if (
				typeof attributeValue !== "boolean" &&
				typeof attributeValue !== "number" &&
				typeof attributeValue !== "string"
			) {
				continue;
			}

			telemetryAttributes[attributeName] = attributeValue;
		}
		const telemetryEventName =
			typeof structuredFields["event"] === "string" && /^[a-z][a-z0-9_.]{0,127}$/.test(structuredFields["event"])
				? structuredFields["event"]
				: undefined;
		const outputFields = this._includeFullDetails ? fields : { ...telemetryAttributes };
		const logMessage = this._includeFullDetails
			? typeof params.message === "string"
				? params.message
				: (error?.name ?? telemetryEventName ?? "structured.log.event")
			: (telemetryEventName ?? (context === undefined ? "application.log" : `${context}.log`));
		const telemetrySeverity = this._getTelemetrySeverity({ level: params.level });
		this._telemetryLogger.emit({
			attributes: telemetryAttributes,
			body: telemetryEventName ?? (context === undefined ? "application.log" : `${context}.log`),
			context: telemetryContext.active(),
			...(telemetryEventName === undefined ? {} : { eventName: telemetryEventName }),
			severityNumber: telemetrySeverity.severityNumber,
			severityText: telemetrySeverity.severityText,
		});

		switch (params.level) {
			case StructuredLogLevel.DEBUG:
				this._logger.debug(outputFields, logMessage);
				return;
			case StructuredLogLevel.ERROR:
				this._logger.error(outputFields, logMessage);
				return;
			case StructuredLogLevel.FATAL:
				this._logger.fatal(outputFields, logMessage);
				return;
			case StructuredLogLevel.INFO:
				this._logger.info(outputFields, logMessage);
				return;
			case StructuredLogLevel.TRACE:
				this._logger.trace(outputFields, logMessage);
				return;
			case StructuredLogLevel.WARN:
				this._logger.warn(outputFields, logMessage);
				return;
		}
	}

	private _getTelemetrySeverity(params: { level: StructuredLogLevel }): {
		severityNumber: SeverityNumber;
		severityText: string;
	} {
		switch (params.level) {
			case StructuredLogLevel.DEBUG:
				return { severityNumber: SeverityNumber.DEBUG, severityText: "debug" };
			case StructuredLogLevel.ERROR:
				return { severityNumber: SeverityNumber.ERROR, severityText: "error" };
			case StructuredLogLevel.FATAL:
				return { severityNumber: SeverityNumber.FATAL, severityText: "fatal" };
			case StructuredLogLevel.INFO:
				return { severityNumber: SeverityNumber.INFO, severityText: "info" };
			case StructuredLogLevel.TRACE:
				return { severityNumber: SeverityNumber.TRACE, severityText: "trace" };
			case StructuredLogLevel.WARN:
				return { severityNumber: SeverityNumber.WARN, severityText: "warn" };
		}
	}
}

export function createStructuredLogger(params: {
	environment: "development" | "production" | "staging" | "test";
	serviceVersion: string;
}): StructuredLogger {
	const sensitiveLogPaths = [
		"authorization",
		"cookie",
		"databaseUrl",
		"headers.authorization",
		"headers.cookie",
		"req.headers.authorization",
		"req.headers.cookie",
		"jobId",
		"messageId",
		"phoneNumber",
		"sessionId",
		"token",
		"userId",
	];
	const productionErrorLogPaths = ["errorCause", "errorDetails", "errorMessage", "errorStack"];

	return new StructuredLogger({
		includeFullDetails: params.environment === "development",
		logger: pino({
			base: {
				env: params.environment,
				service: "cataqui-api",
				version: params.serviceVersion,
			},
			level: params.environment === "test" ? "silent" : params.environment === "development" ? "debug" : "info",
			mixin: () => {
				const spanContext = trace.getActiveSpan()?.spanContext();
				if (spanContext === undefined) return {};
				return { span_id: spanContext.spanId, trace_id: spanContext.traceId };
			},
			...(params.environment === "development"
				? {}
				: {
						redact: {
							censor: "[REDACTED]",
							paths: [...sensitiveLogPaths, ...productionErrorLogPaths],
						},
					}),
		}),
		telemetryLogger: logs.getLogger("cataqui-api", params.serviceVersion),
	});
}
