import type { DiagLogger } from "@opentelemetry/api";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { getSafeErrorTelemetryFields } from "./safe-error-telemetry";

enum OpenTelemetryDiagnosticCategory {
	AUTHENTICATION = "AUTHENTICATION",
	NETWORK = "NETWORK",
	PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",
	RATE_LIMITED = "RATE_LIMITED",
	TIMEOUT = "TIMEOUT",
	UNKNOWN = "UNKNOWN",
}

enum OpenTelemetryDiagnosticSeverity {
	ERROR = "ERROR",
	WARN = "WARN",
}

function _getDiagnosticText(params: { message: string; optionalArguments: unknown[] }): string {
	return [
		params.message,
		...params.optionalArguments.flatMap((argument) => {
			if (typeof argument === "string") return [argument];
			if (argument instanceof Error) return [argument.name, argument.message];
			return [];
		}),
	]
		.join(" ")
		.toLowerCase();
}

function _getOpenTelemetryDiagnosticCategory(params: {
	message: string;
	optionalArguments: unknown[];
}): OpenTelemetryDiagnosticCategory {
	const diagnosticText = _getDiagnosticText({
		message: params.message,
		optionalArguments: params.optionalArguments,
	});
	if (/\b(401|403)\b|unauthori[sz]ed|forbidden|authentication/.test(diagnosticText)) {
		return OpenTelemetryDiagnosticCategory.AUTHENTICATION;
	}
	if (/\b413\b|payload too large|request entity too large/.test(diagnosticText)) {
		return OpenTelemetryDiagnosticCategory.PAYLOAD_TOO_LARGE;
	}
	if (/\b429\b|rate.?limit|too many requests/.test(diagnosticText)) {
		return OpenTelemetryDiagnosticCategory.RATE_LIMITED;
	}
	if (/timeout|timed out|deadline|etimedout/.test(diagnosticText)) return OpenTelemetryDiagnosticCategory.TIMEOUT;
	if (/econn|enotfound|dns|fetch failed|network|socket/.test(diagnosticText)) {
		return OpenTelemetryDiagnosticCategory.NETWORK;
	}

	return OpenTelemetryDiagnosticCategory.UNKNOWN;
}

function _writeOpenTelemetryDiagnostic(params: {
	message: string;
	optionalArguments: unknown[];
	severity: OpenTelemetryDiagnosticSeverity;
}): void {
	const error = params.optionalArguments.find((argument) => argument instanceof Error);
	process.stderr.write(
		`${JSON.stringify({
			diagnosticCategory: _getOpenTelemetryDiagnosticCategory({
				message: params.message,
				optionalArguments: params.optionalArguments,
			}),
			event: ObservabilityEventConstants.API_TELEMETRY_DIAGNOSTIC_EVENT,
			level: params.severity === OpenTelemetryDiagnosticSeverity.ERROR ? "error" : "warn",
			severity: params.severity,
			timestamp: new Date().toISOString(),
			...(error === undefined ? {} : { errorName: getSafeErrorTelemetryFields({ error: error }).errorName }),
		})}\n`,
	);
}

export function createOpenTelemetryDiagnosticLogger(): DiagLogger {
	return {
		debug: () => undefined,
		error: (message, ...optionalArguments) =>
			_writeOpenTelemetryDiagnostic({
				message: message,
				optionalArguments: optionalArguments,
				severity: OpenTelemetryDiagnosticSeverity.ERROR,
			}),
		info: () => undefined,
		verbose: () => undefined,
		warn: (message, ...optionalArguments) =>
			_writeOpenTelemetryDiagnostic({
				message: message,
				optionalArguments: optionalArguments,
				severity: OpenTelemetryDiagnosticSeverity.WARN,
			}),
	};
}
