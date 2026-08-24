const redisMocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("redis", () => ({ createClient: redisMocks.createClient }));

import type { IRedisConfig } from "../config/redis.config";
import { RedisCommandError, RedisService } from "./redis.service";

type ClientHarness = ReturnType<typeof _createClientHarness>;

function _createClientHarness() {
	const subscriberErrorListeners: Array<() => void> = [];
	const subscriberReadyListeners: Array<() => void> = [];
	const subscriptionCallbacks = new Map<string, (message: string) => void>();
	const subscriber = {
		isOpen: false,
		close: vi.fn(async () => {
			subscriber.isOpen = false;
		}),
		connect: vi.fn(async () => {
			subscriber.isOpen = true;
		}),
		on: vi.fn((event: string, listener: () => void) => {
			if (event === "error") subscriberErrorListeners.push(listener);
			if (event === "ready") subscriberReadyListeners.push(listener);
			return subscriber;
		}),
		subscribe: vi.fn(async (channel: string, listener: (message: string) => void) => {
			subscriptionCallbacks.set(channel, listener);
		}),
		unsubscribe: vi.fn(async (channel: string) => {
			subscriptionCallbacks.delete(channel);
		}),
	};
	const command = {
		isOpen: false,
		close: vi.fn(async () => {
			command.isOpen = false;
		}),
		connect: vi.fn(async () => {
			command.isOpen = true;
		}),
		duplicate: vi.fn(() => subscriber),
		eval: vi.fn(),
		evalSha: vi.fn(),
		hGetAll: vi.fn(),
		on: vi.fn(() => command),
		ping: vi.fn(),
		scriptLoad: vi.fn(),
		set: vi.fn(),
	};
	return { command, subscriber, subscriberErrorListeners, subscriberReadyListeners, subscriptionCallbacks };
}

const plaintextConfig: IRedisConfig = {
	password: "test-password",
	url: "redis://redis.example.com:6379",
	username: "runtime",
};

function _service(harness: ClientHarness, config: IRedisConfig = plaintextConfig): RedisService {
	redisMocks.createClient.mockReturnValue(harness.command);
	return new RedisService(config);
}

describe("RedisService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("configures a plaintext command client and one duplicate subscriber", () => {
		const harness = _createClientHarness();
		const service = _service(harness);

		expect(service).toBeDefined();
		expect(redisMocks.createClient).toHaveBeenCalledWith({
			password: "test-password",
			url: "redis://redis.example.com:6379",
			username: "runtime",
		});
		expect(harness.command.duplicate).toHaveBeenCalledOnce();
	});

	it("configures certificate verification for TLS", () => {
		const harness = _createClientHarness();
		_service(harness, {
			caCertificate: "certificate",
			password: "test-password",
			url: "rediss://redis.example.com:6380",
			username: "runtime",
		});

		expect(redisMocks.createClient).toHaveBeenCalledWith(
			expect.objectContaining({ socket: { ca: "certificate", tls: true } }),
		);
	});

	it("connects both clients at startup and closes them at shutdown", async () => {
		const harness = _createClientHarness();
		const service = _service(harness);

		await service.onModuleInit();
		await service.onModuleDestroy();

		expect(harness.command.connect).toHaveBeenCalledOnce();
		expect(harness.subscriber.connect).toHaveBeenCalledOnce();
		expect(harness.command.close).toHaveBeenCalledOnce();
		expect(harness.subscriber.close).toHaveBeenCalledOnce();
		expect(() => service.subscribe("auth:channel")).toThrow(RedisCommandError);
	});

	it("keeps command startup available when the subscriber cannot connect", async () => {
		const harness = _createClientHarness();
		harness.subscriber.connect.mockRejectedValueOnce(new Error("unavailable"));

		await expect(_service(harness).onModuleInit()).resolves.toBeUndefined();
	});

	it("adapts commands and hides provider errors", async () => {
		const harness = _createClientHarness();
		const service = _service(harness);
		harness.command.eval.mockResolvedValue(1);
		harness.command.hGetAll.mockResolvedValueOnce({ field: "value" }).mockResolvedValueOnce({});
		harness.command.ping.mockResolvedValue("PONG");
		harness.command.set.mockResolvedValue("OK");
		harness.command.scriptLoad.mockResolvedValue("sha");

		await expect(service.eval("return 1", ["auth:key"], ["argument"])).resolves.toBe(1);
		await expect(service.hgetall("auth:key")).resolves.toEqual({ field: "value" });
		await expect(service.hgetall("auth:missing")).resolves.toBeNull();
		await expect(service.ping()).resolves.toBe("PONG");
		await expect(service.set("auth:key", "value", { nx: true, px: 1000 })).resolves.toBe("OK");
		await expect(service.preloadScripts(["return 1"])).resolves.toBeUndefined();
		expect(harness.command.set).toHaveBeenCalledWith("auth:key", "value", { NX: true, PX: 1000 });

		for (const method of [harness.command.eval, harness.command.hGetAll, harness.command.ping, harness.command.set]) {
			method.mockRejectedValueOnce(new Error("private details"));
		}
		await expect(service.eval("return 1", [], [])).rejects.toBeInstanceOf(RedisCommandError);
		await expect(service.hgetall("auth:key")).rejects.toBeInstanceOf(RedisCommandError);
		await expect(service.ping()).rejects.toBeInstanceOf(RedisCommandError);
		await expect(service.set("auth:key", "value")).rejects.toBeInstanceOf(RedisCommandError);
		harness.command.scriptLoad.mockRejectedValueOnce(new Error("private details"));
		await expect(service.preloadScripts(["return 1"])).rejects.toBeInstanceOf(RedisCommandError);
	});

	it("uses EVALSHA and falls back to EVAL only for NOSCRIPT", async () => {
		const harness = _createClientHarness();
		const service = _service(harness);
		harness.command.evalSha.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("NOSCRIPT missing"));
		harness.command.eval.mockResolvedValue(2);
		const script = service.createScript<number>("return 1");

		await expect(script.exec(["auth:key"], [])).resolves.toBe(1);
		await expect(script.exec(["auth:key"], [])).resolves.toBe(2);
		harness.command.evalSha.mockRejectedValueOnce(new Error("permission denied"));
		await expect(script.exec([], [])).rejects.toBeInstanceOf(RedisCommandError);
	});

	it("multiplexes local listeners over one channel subscription", async () => {
		const harness = _createClientHarness();
		harness.subscriber.isOpen = true;
		const service = _service(harness);
		const first = service.subscribe<string>("auth:channel");
		const second = service.subscribe<string>("auth:channel");
		const firstReady = vi.fn();
		const secondReady = vi.fn();
		const firstMessage = vi.fn();
		const secondMessage = vi.fn();
		first.on("subscribe", firstReady).on("message", firstMessage);
		second.on("subscribe", secondReady).on("message", secondMessage);

		await vi.waitFor(() => expect(harness.subscriber.subscribe).toHaveBeenCalledOnce());
		harness.subscriptionCallbacks.get("auth:channel")?.("VERIFIED");
		expect(firstReady).toHaveBeenCalledOnce();
		expect(secondReady).toHaveBeenCalledOnce();
		expect(firstMessage).toHaveBeenCalledWith({ channel: "auth:channel", message: "VERIFIED" });
		expect(secondMessage).toHaveBeenCalledOnce();

		await first.unsubscribe();
		expect(harness.subscriber.unsubscribe).not.toHaveBeenCalled();
		await second.unsubscribe();
		expect(harness.subscriber.unsubscribe).toHaveBeenCalledWith("auth:channel");
		await second.unsubscribe();
	});

	it("reports shared subscription failures without exposing details", async () => {
		const harness = _createClientHarness();
		harness.subscriber.isOpen = true;
		harness.subscriber.subscribe.mockRejectedValueOnce(new Error("private details"));
		const subscription = _service(harness).subscribe("auth:channel");
		const unavailable = vi.fn();
		subscription.on("error", unavailable);

		await vi.waitFor(() => expect(unavailable).toHaveBeenCalledWith(expect.any(RedisCommandError)));
		await expect(subscription.unsubscribe()).resolves.toBeUndefined();
	});

	it("fans out subscriber connection errors and readiness after reconnection", async () => {
		const harness = _createClientHarness();
		harness.subscriber.isOpen = true;
		const subscription = _service(harness).subscribe("auth:channel");
		const unavailable = vi.fn();
		const ready = vi.fn();
		subscription.on("error", unavailable);
		subscription.on("subscribe", ready);
		await vi.waitFor(() => expect(harness.subscriber.subscribe).toHaveBeenCalledOnce());
		ready.mockClear();

		harness.subscriberErrorListeners[0]?.();
		harness.subscriberReadyListeners[0]?.();

		expect(unavailable).toHaveBeenCalledWith(expect.any(RedisCommandError));
		expect(ready).toHaveBeenCalledWith("auth:channel");
	});
});
