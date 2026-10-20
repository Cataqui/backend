import * as td from "testdouble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdleSession } from "./idle-session";

afterEach(() => td.reset());
afterEach(() => vi.useRealTimers());

describe("Workerhole idle sessions", () => {
	it("keeps an unbounded session open", async () => {
		vi.useFakeTimers();
		const close = td.func<() => void>();
		new IdleSession({ timeoutMs: undefined, close: close });
		await vi.advanceTimersByTimeAsync(60_000);
		td.verify(close(), { times: 0 });
	});

	it("closes an unused session at its idle deadline", async () => {
		vi.useFakeTimers();
		const close = td.func<() => void>();
		new IdleSession({ timeoutMs: 100, close: close });
		await vi.advanceTimersByTimeAsync(100);
		td.verify(close(), { times: 1 });
	});

	it("does not close while either direction still owns a call", async () => {
		vi.useFakeTimers();
		const close = td.func<() => void>();
		const session = new IdleSession({ timeoutMs: 100, close: close });
		const first = session.acquire();
		session.acquire();
		first();
		await vi.advanceTimersByTimeAsync(1_000);
		td.verify(close(), { times: 0 });
		session.close();
	});

	it("starts a fresh idle period when the last call releases its ownership", async () => {
		vi.useFakeTimers();
		const close = td.func<() => void>();
		const session = new IdleSession({ timeoutMs: 100, close: close });
		const release = session.acquire();
		await vi.advanceTimersByTimeAsync(1_000);
		release();
		release();
		await vi.advanceTimersByTimeAsync(99);
		const before = td.explain(close).callCount;
		await vi.advanceTimersByTimeAsync(1);
		expect({ before: before, after: td.explain(close).callCount }).toEqual({ before: 0, after: 1 });
	});

	it("cancels an old idle countdown when a new call starts", async () => {
		vi.useFakeTimers();
		const close = td.func<() => void>();
		const session = new IdleSession({ timeoutMs: 100, close: close });
		await vi.advanceTimersByTimeAsync(99);
		const release = session.acquire();
		await vi.advanceTimersByTimeAsync(100);
		release();
		await vi.advanceTimersByTimeAsync(99);
		td.verify(close(), { times: 0 });
		session.close();
	});

	it("does not restart its timer when a call releases after shutdown", async () => {
		vi.useFakeTimers();
		const close = td.func<() => void>();
		const session = new IdleSession({ timeoutMs: 100, close: close });
		const release = session.acquire();
		session.close();
		release();
		await vi.advanceTimersByTimeAsync(1_000);
		td.verify(close(), { times: 0 });
	});
});
