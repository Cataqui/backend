import type { IApiContainerInboundWorker } from "@cataqui/api-internal-ingress";

declare global {
	type WebhooksWorkerEnv = Omit<GeneratedWebhooksWorkerEnv, "API_WORKER"> & {
		API_WORKER: IApiContainerInboundWorker;
	};
}
