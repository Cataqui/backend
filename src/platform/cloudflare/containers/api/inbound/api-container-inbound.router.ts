import { type ApiContainerInboundReceiver, apiContainerInboundManifest } from "./api-container-inbound.manifest";
import { getInboundCallUrl } from "./utils";

function _isApiContainerInboundReceiver(value: string): value is ApiContainerInboundReceiver {
	return Object.hasOwn(apiContainerInboundManifest, value);
}

export async function routeInboundCall(params: {
	receiver: string;
	body: unknown;
	deliver: (params: { url: string; requestOptions: RequestInit }) => Promise<Response>;
}): Promise<Response> {
	if (!_isApiContainerInboundReceiver(params.receiver)) return new Response(null, { status: 404 });

	const bodyResult = apiContainerInboundManifest[params.receiver].bodySchema.safeParse(params.body);
	if (!bodyResult.success) return new Response(null, { status: 400 });

	return params.deliver({
		url: getInboundCallUrl({ receiver: params.receiver }),
		requestOptions: {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(bodyResult.data),
		},
	});
}
