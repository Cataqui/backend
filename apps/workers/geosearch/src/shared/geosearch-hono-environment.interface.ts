import type { SourceSafeErrorTelemetryFields } from "@cataqui/observability-contracts";

export interface IGeosearchHonoEnvironment {
	Bindings: GeosearchWorkerEnv;
	Variables: {
		authenticatedUserId: string;
		requestErrorTelemetry: SourceSafeErrorTelemetryFields | undefined;
		requestId: string;
	};
}
