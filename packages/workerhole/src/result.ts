export class Result {
	readonly value: unknown;
	private readonly _release: () => void;
	private _streams = 0;

	constructor(params: { value: unknown; release: () => void }) {
		this._release = params.release;
		this.value = this._wrap(params.value);
		this._releaseIfComplete();
	}

	private _wrap(value: unknown): unknown {
		if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
		if (value instanceof ReadableStream) {
			const reader = value.getReader();
			this._streams++;
			let finished = false;
			const finish = (): void => {
				if (finished) return;
				finished = true;
				reader.releaseLock();
				this._streams--;
				this._releaseIfComplete();
			};
			return new ReadableStream<unknown>(
				{
					start(controller): void {
						// Producer failure must release ownership even when the consumer never reads.
						void reader.closed.catch((error: unknown): void => {
							controller.error(error);
							finish();
						});
					},
					pull: async (controller): Promise<void> => {
						try {
							const chunk = await reader.read();
							if (finished) return;
							if (chunk.done) {
								controller.close();
								finish();
								return;
							}
							controller.enqueue(this._wrap(chunk.value));
						} catch (error) {
							controller.error(error);
							finish();
						}
					},
					async cancel(reason): Promise<void> {
						try {
							await reader.cancel(reason);
						} finally {
							finish();
						}
					},
				},
				{ highWaterMark: 0 },
			);
		}
		if (Array.isArray(value)) return value.map((item) => this._wrap(item));
		if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
			return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this._wrap(item)]));
		return value;
	}

	private _releaseIfComplete(): void {
		const allStreamsFinished = this._streams === 0;
		if (allStreamsFinished) this._release();
	}
}
