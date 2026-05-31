import { getContainer } from "@cloudflare/containers";
import { ApiContainer } from "./container";

export { ApiContainer };

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const container = getContainer(env.API_CONTAINER);
		return container.fetch(request);
	},
} satisfies ExportedHandler<Env>;
