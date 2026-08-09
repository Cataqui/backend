import type { z } from "zod";
import { apiContainerOutboundManifest } from "./api-container-outbound.manifest";

type ApiContainerOutboundDefinition = (typeof apiContainerOutboundManifest)[number];
type ApiContainerOutboundDefinitionByHost = {
	[Definition in ApiContainerOutboundDefinition as Definition["outboundHost"]]: Definition;
};

export async function outboundCall<Host extends ApiContainerOutboundDefinition["outboundHost"]>(params: {
	host: Host;
	body: z.input<ApiContainerOutboundDefinitionByHost[Host]["bodySchema"]>;
}): Promise<Response> {
	return fetch(`http://${params.host}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(params.body),
	});
}
