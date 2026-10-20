import * as td from "testdouble";
import { AsyncQueue, AsyncQueueFullError } from "./index";

afterEach(() => td.reset());

it.each([undefined, {}, { queueLimit: Infinity }])(
	"defaults to sequential execution and unlimited waiting with options %j",
	async (options) => {
		const queue = new AsyncQueue(options);
		const gate = Promise.withResolvers<number>();
		const started: number[] = [];
		const first = queue.enqueue(() => gate.promise);
		const rest = Array.from({ length: 20 }, (_, index) =>
			queue.enqueue(() => {
				started.push(index);
				return index;
			}),
		);
		expect(queue.activeCount).toBe(1);
		expect(queue.queuedCount).toBe(20);
		expect(started).toEqual([]);
		gate.resolve(42);
		expect(await first).toBe(42);
		expect(await Promise.all(rest)).toEqual(Array.from({ length: 20 }, (_, index) => index));
		expect(started).toEqual(Array.from({ length: 20 }, (_, index) => index));
		await queue.wait();
		expect(queue.activeCount).toBe(0);
		expect(queue.queuedCount).toBe(0);
	},
);

it("reserves concurrent slots before callbacks run and starts waiting work in FIFO order", async () => {
	const queue = new AsyncQueue({ concurrencyLimit: 2, queueLimit: 2 });
	const gates = Array.from({ length: 4 }, () => Promise.withResolvers<number>());
	const starts = Array.from({ length: 4 }, () => Promise.withResolvers<void>());
	const order: number[] = [];
	const results = gates.map((gate, index) =>
		queue.enqueue(() => {
			order.push(index);
			starts[index]!.resolve();
			return gate.promise;
		}),
	);
	const rejected = td.func<() => string>();
	td.when(rejected()).thenReturn("must not run");
	const overflow = queue.enqueue(rejected);
	expect(order).toEqual([]);
	expect(queue.activeCount).toBe(2);
	expect(queue.queuedCount).toBe(2);
	await expect(overflow).rejects.toBeInstanceOf(AsyncQueueFullError);
	await Promise.all([starts[0]!.promise, starts[1]!.promise]);
	expect(order).toEqual([0, 1]);
	gates[1]!.resolve(1);
	await starts[2]!.promise;
	expect(queue.activeCount).toBe(2);
	expect(queue.queuedCount).toBe(1);
	gates[0]!.resolve(0);
	await starts[3]!.promise;
	expect(order).toEqual([0, 1, 2, 3]);
	expect(queue.queuedCount).toBe(0);
	gates[2]!.resolve(2);
	gates[3]!.resolve(3);
	expect(await Promise.all(results)).toEqual([0, 1, 2, 3]);
	expect(td.explain(rejected).callCount).toBe(0);
});

it.each(["return", "throw", "reject"] as const)(
	"releases capacity before exposing a task's %s outcome",
	async (outcome) => {
		const queue = new AsyncQueue({ queueLimit: 0 });
		const value = { result: 42 };
		const error = new Error("original task failure");
		const result = queue.enqueue(() => {
			if (outcome === "throw") throw error;
			if (outcome === "reject") return Promise.reject(error);
			return value;
		});
		if (outcome === "return") expect(await result).toBe(value);
		else await expect(result).rejects.toBe(error);
		expect(queue.activeCount).toBe(0);
		expect(queue.queuedCount).toBe(0);
		expect(await queue.enqueue(() => "next")).toBe("next");
	},
);

it("accepts PromiseLike results with their inferred result type", async () => {
	const queue = new AsyncQueue();
	const thenable: PromiseLike<number> = {
		// biome-ignore lint/suspicious/noThenProperty: Exercise the public PromiseLike callback contract.
		then: (resolve, reject) => Promise.resolve(42).then(resolve, reject),
	};
	const result: Promise<number> = queue.enqueue(() => thenable);
	expect(await result).toBe(42);
});

it("continues FIFO execution after a queued task throws", async () => {
	const queue = new AsyncQueue();
	const gate = Promise.withResolvers<void>();
	const first = queue.enqueue(() => gate.promise);
	const error = new Error("queued task failure");
	const failed = queue.enqueue(() => {
		throw error;
	});
	const rejection = expect(failed).rejects.toBe(error);
	const last = queue.enqueue(() => "last");
	gate.resolve();
	await first;
	await rejection;
	expect(await last).toBe("last");
	await queue.wait();
});

it("allows no waiting tasks while still admitting an immediately available slot", async () => {
	const queue = new AsyncQueue({ concurrencyLimit: 2, queueLimit: 0 });
	const gate = Promise.withResolvers<void>();
	const first = queue.enqueue(() => gate.promise);
	const second = queue.enqueue(() => gate.promise);
	const callback = td.func<() => void>();
	await expect(queue.enqueue(callback)).rejects.toMatchObject({
		name: "AsyncQueueFullError",
		message: "Async queue is full",
	});
	expect(queue.queuedCount).toBe(0);
	td.verify(callback(), { times: 0 });
	gate.resolve();
	await Promise.all([first, second]);
	expect(await queue.enqueue(() => 3)).toBe(3);
});

it("waits for newly queued work, supports multiple waiters, and ignores task failure", async () => {
	const queue = new AsyncQueue();
	await queue.wait();
	const firstGate = Promise.withResolvers<void>();
	const first = queue.enqueue(() => firstGate.promise);
	const idle = td.func<() => void>();
	const firstWait = queue.wait().then(() => idle());
	const secondWait = queue.wait().then(() => idle());
	const lastGate = Promise.withResolvers<void>();
	const started = Promise.withResolvers<void>();
	const last = queue.enqueue(() => {
		started.resolve();
		return lastGate.promise;
	});
	const error = new Error("last task failed");
	const rejection = expect(last).rejects.toBe(error);
	firstGate.resolve();
	await first;
	await started.promise;
	td.verify(idle(), { times: 0 });
	lastGate.reject(error);
	await rejection;
	await Promise.all([firstWait, secondWait]);
	td.verify(idle(), { times: 2 });
	await queue.wait();
	const nextGate = Promise.withResolvers<void>();
	const next = queue.enqueue(() => nextGate.promise);
	const nextWait = queue.wait().then(() => idle());
	await Promise.resolve();
	td.verify(idle(), { times: 2 });
	nextGate.resolve();
	await next;
	await nextWait;
	td.verify(idle(), { times: 3 });
});

it.each([0, -1, 1.5, NaN, Infinity, -Infinity])("rejects invalid concurrencyLimit %s", (limit) => {
	expect(() => new AsyncQueue({ concurrencyLimit: limit })).toThrow(RangeError);
});

it.each([-1, 1.5, NaN, -Infinity])("rejects invalid queueLimit %s", (limit) => {
	expect(() => new AsyncQueue({ queueLimit: limit })).toThrow(RangeError);
});
