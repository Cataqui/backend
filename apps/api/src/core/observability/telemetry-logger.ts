import { inspect } from "node:util";
import { ConsoleLogger, type LogLevel } from "@nestjs/common";
import type { AnyValueMap } from "@opentelemetry/api-logs";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { TELEMETRY_SERVICE_NAME } from "./telemetry";

// Only problems go to Datadog. Info and debug output stays in the console so log volume and cost stay small.
const EXPORTED_SEVERITY: Partial<Record<LogLevel, SeverityNumber>> = {
	warn: SeverityNumber.WARN,
	error: SeverityNumber.ERROR,
	fatal: SeverityNumber.FATAL,
};

/**
 * Nest console logger that also sends warnings and errors to Datadog. Each record carries the active trace, so a log
 * line links to the request that produced it. Levels disabled on the logger are never sent.
 */
export class TelemetryLogger extends ConsoleLogger {
	protected override printMessages(
		messages: unknown[],
		context?: string,
		logLevel?: LogLevel,
		writeStreamType?: "stdout" | "stderr",
		errorStack?: unknown,
		params?: Record<string, unknown>,
	): void {
		super.printMessages(messages, context, logLevel, writeStreamType, errorStack, params);

		if (logLevel === undefined) return;
		const severityNumber = EXPORTED_SEVERITY[logLevel];
		if (severityNumber === undefined) return;

		const telemetryLogger = logs.getLogger(TELEMETRY_SERVICE_NAME);
		for (const message of messages) {
			const record = _describeMessage({ message: message, errorStack: errorStack });

			telemetryLogger.emit({
				severityNumber: severityNumber,
				severityText: logLevel,
				body: record.body,
				attributes: {
					...(context === undefined || context === "" ? {} : { "logger.name": context }),
					...record.attributes,
				},
			});
		}
	}
}

function _describeMessage(params: { message: unknown; errorStack: unknown }): {
	body: string;
	attributes: AnyValueMap;
} {
	if (params.message instanceof Error) {
		return {
			body: params.message.message,
			attributes: {
				"error.kind": params.message.name,
				"error.message": params.message.message,
				...(params.message.stack === undefined ? {} : { "error.stack": params.message.stack }),
			},
		};
	}

	const body = typeof params.message === "string" ? params.message : inspect(params.message);
	if (typeof params.errorStack !== "string") return { body: body, attributes: {} };

	return { body: body, attributes: { "error.message": body, "error.stack": params.errorStack } };
}
