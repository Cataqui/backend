import {
	defineWorkerPortal,
	defineWorkerContainerPortal,
	connectWorkerToContainer,
	type CallContext,
} from "@cataqui/workerhole";
import { WorkerPortal } from "@cataqui/workerhole/worker";
abstract class WorkerDefinition extends defineWorkerPortal<{
	read(input: string, context: CallContext): Promise<Uint8Array>;
}>() {}
abstract class WrongWorker extends defineWorkerPortal<{
	read(input: string, context: CallContext): Promise<number>;
}>() {}
abstract class ContainerDefinition extends defineWorkerContainerPortal<{
	read(input: string, context: CallContext): Promise<Uint8Array>;
}>() {}
class LocalWorker extends WorkerPortal<unknown, typeof WorkerDefinition> {
	readonly expose = {
		read: async (_input: string, _context: CallContext): Promise<Uint8Array> => new Uint8Array(),
	};
}
class OtherWorker extends WorkerPortal<unknown, typeof WrongWorker> {
	readonly expose = {
		read: async (_input: string, _context: CallContext): Promise<number> => 1,
	};
}
export function checkWorkerBinding(
	context: DurableObjectState,
	binding: LoopbackServiceStub<WorkerPortal<unknown, typeof WorkerDefinition>>,
): Promise<Uint8Array> {
	const client: ContainerDefinition = connectWorkerToContainer(ContainerDefinition, {
		context: context,
		expose: LocalWorker,
	});
	// Remote and local capabilities may have independent methods; the local portal owns its contract.
	const otherLocal = connectWorkerToContainer(ContainerDefinition, { context: context, expose: OtherWorker });
	void otherLocal;
	const ordinary = { expose: { read: async (): Promise<Uint8Array> => new Uint8Array() } };
	// @ts-expect-error Local registration requires a portal class, not an instance.
	connectWorkerToContainer(ContainerDefinition, { context: context, expose: ordinary });
	// @ts-expect-error A native service binding is not a portal class.
	connectWorkerToContainer(ContainerDefinition, { context: context, expose: binding });
	// @ts-expect-error Export maps are not part of the class-only API.
	connectWorkerToContainer(ContainerDefinition, { context: context, expose: { LocalWorker: LocalWorker } });
	// @ts-expect-error Worker-to-container targets must be container definitions.
	connectWorkerToContainer(WorkerDefinition, { context: context, expose: LocalWorker });
	// @ts-expect-error The package owns the destination Workerhole port.
	connectWorkerToContainer(ContainerDefinition, { context: context, expose: LocalWorker, port: 8080 });
	// @ts-expect-error Client arguments retain their declared types.
	client.read(123);
	// @ts-expect-error Dispatcher context is not a client argument.
	client.read("source", { signal: new AbortController().signal });
	return client.withOptions({ timeoutMs: 100 }).read("source");
}
