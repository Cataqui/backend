import { defineWorkerPortal, type CallContext } from "@cataqui/workerhole";

export abstract class ApiWorkerPortal extends defineWorkerPortal<{
	getStaticMapLocationUrl(
		input: { latitude: number; longitude: number },
		context: CallContext,
	): Promise<{ url: string }>;
}>() {}
