import {
	connectContainerToWorker,
	defineWorkerPortal,
	defineWorkerContainerPortal,
	type CallContext,
} from "@cataqui/workerhole";
import type { Handlers } from "@cataqui/workerhole";
abstract class WorkerDefinition extends defineWorkerPortal<{
	read(input: string, context: CallContext): Promise<Uint8Array>;
}>() {}
abstract class ContainerDefinition extends defineWorkerContainerPortal<{
	render(input: { size: number }, context: CallContext): Promise<void>;
}>() {}
class Entrypoint {
	readonly expose: Handlers<typeof ContainerDefinition> = {
		render: async (input): Promise<void> => {
			void input.size;
		},
	};
}
export async function check(): Promise<Uint8Array> {
	const client: WorkerDefinition = await connectContainerToWorker(WorkerDefinition, {
		expose: new Entrypoint(),
	});
	// @ts-expect-error Wrong direction.
	connectContainerToWorker(ContainerDefinition, { expose: new Entrypoint() });
	// @ts-expect-error The package owns the HTTP server.
	connectContainerToWorker(WorkerDefinition, { expose: new Entrypoint(), server: {} });
	// @ts-expect-error Definition tokens cannot be instantiated.
	new WorkerDefinition();
	// @ts-expect-error Wrong input.
	client.read(123);
	// @ts-expect-error Wrong output.
	const wrong: Promise<number> = client.read("source");
	void wrong;
	return client.withOptions({ signal: new AbortController().signal, timeoutMs: 100 }).read("source");
}
// @ts-expect-error Handler contexts are required at the definition boundary.
defineWorkerPortal<{ read(input: string): Promise<void> }>();
// @ts-expect-error close belongs to the connection lifecycle.
defineWorkerContainerPortal<{ close(context: CallContext): Promise<void> }>();

// @ts-expect-error All methods require a trailing call context.
defineWorkerContainerPortal<{ run(input: string): Promise<void> }>();
// @ts-expect-error Optional contexts would not be removed from client arguments.
defineWorkerPortal<{ run(context?: CallContext): Promise<void> }>();
// @ts-expect-error Context must be the final parameter.
defineWorkerPortal<{ run(context: CallContext, input: string): Promise<void> }>();
// @ts-expect-error Handlers cannot require context fields the dispatcher does not supply.
defineWorkerPortal<{ run(context: CallContext & { requestId: string }): Promise<void> }>();
// @ts-expect-error Non-method fields are not Portal operations.
defineWorkerPortal<{ label: string }>();
// @ts-expect-error close is reserved for lifecycle management.
defineWorkerPortal<{ close(context: CallContext): Promise<void> }>();
// @ts-expect-error withOptions is reserved for call configuration.
defineWorkerContainerPortal<{ withOptions(context: CallContext): Promise<void> }>();
// @ts-expect-error then is reserved to avoid treating clients as promises.
defineWorkerPortal<{ then(context: CallContext): Promise<void> }>();
