import { AsyncQueueFullError } from "./async-queue-full.error";

export class AsyncQueue {
	private readonly _concurrencyLimit: number;
	private readonly _queueLimit: number;
	private readonly _queued: Array<() => void> = [];
	private readonly _waiters: Array<() => void> = [];
	private _activeCount = 0;

	constructor(options: { concurrencyLimit?: number; queueLimit?: number } = {}) {
		const concurrencyLimit = options.concurrencyLimit ?? 1;
		const queueLimit = options.queueLimit ?? Infinity;
		if (!Number.isInteger(concurrencyLimit) || concurrencyLimit < 1)
			throw new RangeError("concurrencyLimit must be a positive integer");
		if (queueLimit !== Infinity && (!Number.isInteger(queueLimit) || queueLimit < 0))
			throw new RangeError("queueLimit must be a nonnegative integer or Infinity");
		this._concurrencyLimit = concurrencyLimit;
		this._queueLimit = queueLimit;
	}

	get activeCount(): number {
		return this._activeCount;
	}

	get queuedCount(): number {
		return this._queued.length;
	}

	enqueue<T>(operation: () => T | PromiseLike<T>): Promise<T> {
		const hasCapacity = this._activeCount < this._concurrencyLimit;
		if (!hasCapacity && this._queued.length >= this._queueLimit) return Promise.reject(new AsyncQueueFullError());
		const result = Promise.withResolvers<T>();
		const start = (): void => {
			this._activeCount += 1;
			void Promise.resolve()
				.then(operation)
				.then(
					(value) => {
						this.#_release();
						result.resolve(value);
						this.#_resolveWaiters();
					},
					(error: unknown) => {
						this.#_release();
						result.reject(error);
						this.#_resolveWaiters();
					},
				);
		};
		if (hasCapacity) start();
		else this._queued.push(start);
		return result.promise;
	}

	wait(): Promise<void> {
		if (this._activeCount === 0) return Promise.resolve();
		return new Promise((resolve) => this._waiters.push(resolve));
	}

	#_release(): void {
		this._activeCount -= 1;
		this._queued.shift()?.();
	}

	#_resolveWaiters(): void {
		if (this._activeCount !== 0) return;
		for (const resolve of this._waiters.splice(0)) resolve();
	}
}
