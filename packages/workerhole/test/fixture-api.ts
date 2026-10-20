import { defineWorkerContainerPortal, defineWorkerPortal, type CallContext } from "@cataqui/workerhole";
export abstract class ContainerApi extends defineWorkerContainerPortal<{
	render(input: { size: number }, context: CallContext): Promise<{ bytes: Uint8Array }>;
	reverse(context: CallContext): Promise<number>;
	stall(input: undefined, context: CallContext): Promise<void>;
	aborted(context: CallContext): number;
}>() {}
export abstract class WorkerApi extends defineWorkerPortal<{
	greet(input: { message: string }, context: CallContext): string;
	resource(context: CallContext): ReadableStream<Uint8Array>;
}>() {}
