import { type ApiContainerInboundCall, type ApiContainerInboundReceiver } from "./api-container-inbound.manifest";

export async function inboundCall<Receiver extends ApiContainerInboundReceiver>(
	params: ApiContainerInboundCall<Receiver> & {
		worker: {
			deliverInbound(call: ApiContainerInboundCall<Receiver>): Promise<Response>;
		};
	},
): Promise<Response> {
	return params.worker.deliverInbound({ receiver: params.receiver, body: params.body });
}
