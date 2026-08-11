import type { OutboundHandler } from "@cloudflare/containers";
import { z } from "zod";
import { type ApiContainerOutboundHost, apiContainerOutboundManifest } from "./api-container-outbound.manifest";

function _createOutboundHandler<BodySchema extends z.ZodType>(params: {
	definition: {
		bodySchema: BodySchema;
		execute: (params: { body: z.output<BodySchema>; environment: ApiWorkerEnv }) => Promise<void>;
	};
}): OutboundHandler<ApiWorkerEnv> {
	return async (request, environment) => {
		if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

		let requestBody: unknown;

		try {
			requestBody = await request.json();
		} catch {
			return new Response(null, { status: 400 });
		}

		const bodyResult = params.definition.bodySchema.safeParse(requestBody);
		if (!bodyResult.success) return new Response(null, { status: 400 });

		try {
			await params.definition.execute({ body: bodyResult.data, environment: environment });
		} catch {
			return new Response(null, { status: 503 });
		}

		return new Response(null, { status: 204 });
	};
}

export const apiContainerOutboundHandlers = Object.fromEntries(
	Object.entries(apiContainerOutboundManifest).map(([outboundHost, definition]) => [
		outboundHost,
		_createOutboundHandler({ definition: definition }),
	]),
) as Record<ApiContainerOutboundHost, OutboundHandler<ApiWorkerEnv>>;
