import { type ApiContainerInboundReceiver, inboundReceiverPathPrefix } from "./api-container-inbound.manifest";

export function getInboundCallUrl(params: {
	receiver: ApiContainerInboundReceiver;
}): `http://localhost/${typeof inboundReceiverPathPrefix}/${ApiContainerInboundReceiver}` {
	return `http://localhost/${inboundReceiverPathPrefix}/${params.receiver}`;
}
