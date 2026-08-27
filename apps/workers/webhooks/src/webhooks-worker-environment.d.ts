import type { IApiContainerInboundWorker } from "@cataqui/api-internal-ingress";
import type { SourceSafeErrorTelemetryFields } from "@cataqui/observability-contracts";

declare global {
	type WebhooksWorkerEnv = Omit<GeneratedWebhooksWorkerEnv, "API_WORKER"> & {
		API_WORKER: IApiContainerInboundWorker;
	};

	type WebhooksWorkerHonoEnvironment = {
		Bindings: WebhooksWorkerEnv;
		Variables: {
			requestErrorTelemetry: SourceSafeErrorTelemetryFields | undefined;
			requestId: string;
		};
	};
}
