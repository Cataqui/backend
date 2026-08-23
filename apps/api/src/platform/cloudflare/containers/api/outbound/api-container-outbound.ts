import type { z } from "zod";
import { apiContainerOutboundManifest } from "./api-container-outbound.manifest";

export async function outboundCall<Host extends keyof typeof apiContainerOutboundManifest>(params: {
	host: Host;
	body: z.infer<(typeof apiContainerOutboundManifest)[Host]["bodySchema"]>;
}): Promise<Response> {
	return fetch(`http://${params.host}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(params.body),
	});
}
