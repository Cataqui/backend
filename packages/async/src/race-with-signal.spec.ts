import * as td from "testdouble";
import { raceWithSignal } from "./race-with-signal";

afterEach(() => td.reset());

it("preserves the result identity without a signal", async () => {
	const bytes = new Uint8Array([1, 2, 3]);
	expect(await raceWithSignal(() => Promise.resolve(bytes))).toBe(bytes);
});

it("preserves the original failure without a signal", async () => {
	const error = new Error("operation failed");
	await expect(raceWithSignal(() => Promise.reject(error))).rejects.toBe(error);
});

it.each([undefined, {}])("invokes the operation exactly once with options %o", async (options) => {
	const operation = td.func<() => Promise<string>>();
	td.when(operation()).thenResolve("result");
	expect(await raceWithSignal(operation, options)).toBe("result");
	expect(td.explain(operation).callCount).toBe(1);
});

it.each([undefined, new AbortController().signal])(
	"preserves synchronous operation failures with signal %o",
	async (signal) => {
		const error = new Error("synchronous failure");
		const operation = td.func<() => Promise<string>>();
		td.when(operation()).thenDo((): never => {
			throw error;
		});
		const remove = signal === undefined ? undefined : vi.spyOn(signal, "removeEventListener");
		await expect(raceWithSignal(operation, { signal: signal })).rejects.toBe(error);
		expect(td.explain(operation).callCount).toBe(1);
		if (remove !== undefined) expect(remove).toHaveBeenCalledExactlyOnceWith("abort", expect.any(Function));
	},
);

it.each(["success", "failure", "throw"] as const)(
	"preserves cancellation triggered during invocation before operation %s",
	async (outcome) => {
		const controller = new AbortController();
		const reason = new Error("cancelled during invocation");
		const operation = td.func<() => Promise<string>>();
		td.when(operation()).thenDo((): Promise<string> => {
			controller.abort(reason);
			if (outcome === "throw") throw new Error("synchronous failure after abort");
			return outcome === "success" ? Promise.resolve("late result") : Promise.reject(new Error("late failure"));
		});
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		await expect(raceWithSignal(operation, { signal: controller.signal })).rejects.toBe(reason);
		expect(td.explain(operation).callCount).toBe(1);
		expect(remove).toHaveBeenCalledExactlyOnceWith("abort", expect.any(Function));
	},
);

it.each(["success", "failure"] as const)("removes the listener after operation %s", async (outcome) => {
	const controller = new AbortController();
	const remove = vi.spyOn(controller.signal, "removeEventListener");
	const error = new Error("operation failed");
	const createAbortError = td.func<() => Error>();
	td.when(createAbortError()).thenReturn(new Error("cancelled"));
	const operation = outcome === "success" ? Promise.resolve("result") : Promise.reject(error);
	const result = raceWithSignal(() => operation, { signal: controller.signal, createAbortError: createAbortError });
	if (outcome === "success") expect(await result).toBe("result");
	else await expect(result).rejects.toBe(error);
	controller.abort();
	expect(td.explain(createAbortError).callCount).toBe(0);
	expect(remove).toHaveBeenCalledExactlyOnceWith("abort", expect.any(Function));
});

it("rejects with the signal reason and removes the listener on cancellation", async () => {
	const controller = new AbortController();
	const remove = vi.spyOn(controller.signal, "removeEventListener");
	const operation = Promise.withResolvers<string>();
	const reason = { code: "caller-cancelled" };
	const result = raceWithSignal(() => operation.promise, { signal: controller.signal });
	const rejection = expect(result).rejects.toBe(reason);
	controller.abort(reason);
	await rejection;
	expect(remove).toHaveBeenCalledExactlyOnceWith("abort", expect.any(Function));
	operation.resolve("late result");
	expect(await operation.promise).toBe("late result");
});

it.each(["success", "failure"] as const)("observes late operation %s after cancellation", async (outcome) => {
	const controller = new AbortController();
	const operation = Promise.withResolvers<string>();
	const reason = new Error("caller cancelled");
	const result = raceWithSignal(() => operation.promise, { signal: controller.signal });
	const rejection = expect(result).rejects.toBe(reason);
	controller.abort(reason);
	await rejection;
	if (outcome === "success") operation.resolve("late result");
	else operation.reject(new Error("late failure must be observed"));
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

it("does not invoke the operation when the signal was already aborted", async () => {
	const reason = new Error("already cancelled");
	const operation = td.func<() => Promise<string>>();
	await expect(raceWithSignal(operation, { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
	td.verify(operation(), { times: 0 });
});

it.each([true, false])(
	"creates the caller's abort error only on cancellation (already aborted: %s)",
	async (alreadyAborted) => {
		const controller = new AbortController();
		if (alreadyAborted) controller.abort();
		const operation = Promise.withResolvers<string>();
		const error = new Error("owned cancellation");
		const createAbortError = td.func<() => Error>();
		td.when(createAbortError()).thenReturn(error);
		const start = td.func<() => Promise<string>>();
		td.when(start()).thenReturn(operation.promise);
		const result = raceWithSignal(start, { signal: controller.signal, createAbortError: createAbortError });
		const rejection = expect(result).rejects.toBe(error);
		controller.abort();
		await rejection;
		expect(td.explain(createAbortError).callCount).toBe(1);
		td.verify(start(), { times: alreadyAborted ? 0 : 1 });
		operation.resolve("late result");
	},
);

it("does not create an abort error when cancellation loses before listener cleanup", async () => {
	const controller = new AbortController();
	const operation = Promise.resolve("result");
	const createAbortError = td.func<() => Error>();
	td.when(createAbortError()).thenReturn(new Error("cancelled"));
	const result = raceWithSignal(() => operation, { signal: controller.signal, createAbortError: createAbortError });
	void operation.then(() => controller.abort());
	expect(await result).toBe("result");
	expect(td.explain(createAbortError).callCount).toBe(0);
});

it("does not use the abort error factory without a signal", async () => {
	const createAbortError = td.func<() => Error>();
	td.when(createAbortError()).thenReturn(new Error("cancelled"));
	expect(await raceWithSignal(() => Promise.resolve("result"), { createAbortError: createAbortError })).toBe("result");
	expect(td.explain(createAbortError).callCount).toBe(0);
});
