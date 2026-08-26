import type { ApiContainerInboundCall, ApiContainerInboundReceiver } from "./inbound/api-container-inbound.manifest.js";

export interface IApiContainerInboundWorker {
	deliverInbound<Receiver extends ApiContainerInboundReceiver>(
		call: ApiContainerInboundCall<Receiver>,
	): Promise<Response>;
}
