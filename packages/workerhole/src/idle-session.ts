export function validateIdleTimeout(timeoutMs: number | undefined): void {
	if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647))
		throw new RangeError("Portal idleTimeoutMs must be a positive integer no greater than 2147483647.");
}

export class IdleSession {
	private readonly _timeoutMs: number | undefined;
	private readonly _close: () => void;
	private _timer: ReturnType<typeof setTimeout> | undefined;
	private _activeCount = 0;
	private _closed = false;

	constructor(params: { timeoutMs: number | undefined; close: () => void }) {
		this._timeoutMs = params.timeoutMs;
		this._close = params.close;
		this._schedule();
	}

	acquire(): () => void {
		clearTimeout(this._timer);
		this._activeCount++;
		let released = false;
		return (): void => {
			if (released) return;
			released = true;
			this._activeCount--;
			if (this._activeCount === 0) this._schedule();
		};
	}

	close(): void {
		this._closed = true;
		clearTimeout(this._timer);
	}

	private _schedule(): void {
		if (this._closed || this._timeoutMs === undefined) return;
		this._timer = setTimeout(() => {
			this.close();
			this._close();
		}, this._timeoutMs);
		this._timer.unref?.();
	}
}
