import type { Container } from "@cloudflare/containers";

declare global {
	interface Env {
		API_CONTAINER: DurableObjectNamespace<Container>;
		SLEEP_AFTER: string;
	}
}

export {};
