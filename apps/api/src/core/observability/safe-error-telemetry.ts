import { inspect } from "node:util";

export { getSourceSafeErrorTelemetryFields as getSafeErrorTelemetryFields } from "@cataqui/observability-contracts";

export function getDevelopmentErrorLogFields(params: { error: unknown }): {
	errorCause?: string;
	errorDetails?: string;
	errorMessage: string;
	errorStack?: string;
} {
	if (!(params.error instanceof Error)) {
		if (typeof params.error === "string") return { errorMessage: params.error };
		if (
			typeof params.error === "bigint" ||
			typeof params.error === "boolean" ||
			typeof params.error === "number" ||
			typeof params.error === "symbol" ||
			typeof params.error === "undefined" ||
			params.error === null
		) {
			return { errorMessage: String(params.error) };
		}

		return {
			errorDetails: inspect(params.error, { breakLength: 120, depth: 8, maxArrayLength: 100 }),
			errorMessage: "A non-Error object was thrown",
		};
	}

	const cause = params.error.cause;
	const errorCause =
		cause instanceof Error
			? (cause.stack ?? `${cause.name}: ${cause.message}`)
			: typeof cause === "string"
				? cause
				: undefined;

	return {
		...(errorCause === undefined ? {} : { errorCause: errorCause }),
		errorMessage: params.error.message,
		...(params.error.stack === undefined ? {} : { errorStack: params.error.stack }),
	};
}
