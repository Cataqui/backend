export interface IQueueHandler {
	handle(params: { batch: MessageBatch<unknown>; env: Env; context: ExecutionContext }): Promise<void>;
}
