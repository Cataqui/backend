import { context, propagation } from "@opentelemetry/api";
import type { z } from "zod";
import { apiContainerOutboundManifest } from "./api-container-outbound.manifest";

export async function outboundCall<Host extends keyof typeof apiContainerOutboundManifest>(params: {
	host: Host;
	body: z.infer<(typeof apiContainerOutboundManifest)[Host]["bodySchema"]>;
}): Promise<Response> {
	const headers = new Headers({ "content-type": "application/json" });
	propagation.inject(context.active(), headers, {
		set: (carrier, key, value) => carrier.set(key, value),
	});

	return fetch(`http://${params.host}`, {
		method: "POST",
		headers: headers,
		body: JSON.stringify(params.body),
	});
}
