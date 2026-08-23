import type { IApiContainerInboundWorker } from "../api-container-inbound-worker.interface.js";
import { type ApiContainerInboundCall, type ApiContainerInboundReceiver } from "./api-container-inbound.manifest.js";

export async function inboundCall<Receiver extends ApiContainerInboundReceiver>(
	params: ApiContainerInboundCall<Receiver> & {
		worker: IApiContainerInboundWorker;
	},
): Promise<Response> {
	return params.worker.deliverInbound({ receiver: params.receiver, body: params.body });
}
