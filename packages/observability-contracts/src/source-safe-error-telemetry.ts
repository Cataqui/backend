export type SourceSafeErrorTelemetryFields = {
	errorName: string;
	errorStackFrames?: string;
};

export function getSourceSafeErrorTelemetryFields(params: {
	error: unknown;
	errorStack?: string;
}): SourceSafeErrorTelemetryFields {
	const errorNameCandidate = params.error instanceof Error ? params.error.name : undefined;
	const errorName =
		errorNameCandidate !== undefined && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(errorNameCandidate)
			? errorNameCandidate
			: "UnknownError";
	const errorStack = params.error instanceof Error ? params.error.stack : params.errorStack;
	if (errorStack === undefined) return { errorName: errorName };

	const stackLines = errorStack.split("\n");
	const firstStackFrameIndex = stackLines.findIndex((line) => /^\s*at\s/.test(line));
	if (firstStackFrameIndex === -1) return { errorName: errorName };

	return {
		errorName: errorName,
		errorStackFrames: stackLines
			.slice(firstStackFrameIndex, firstStackFrameIndex + 20)
			.join("\n")
			.slice(0, 8_192),
	};
}
