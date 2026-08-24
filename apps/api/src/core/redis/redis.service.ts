import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { createClient, type RedisClientType } from "redis";
import { type IRedisConfig, redisConfig } from "../config/redis.config";

type RedisScript<TResult> = {
	readonly script: string;
	exec(keys: string[], args: string[]): Promise<TResult>;
};

type RedisSetOptions = {
	nx?: boolean;
	px?: number;
};

type RedisSubscriptionRecord = {
	activation: Promise<void>;
	listeners: Set<RedisSubscription<unknown>>;
	ready: boolean;
	subscribed: boolean;
};

export class RedisCommandError extends Error {
	public constructor() {
		super("Redis rejected the command");
		this.name = "RedisCommandError";
	}
}

export class RedisSubscription<TMessage> extends EventEmitter {
	private _closed = false;

	public constructor(
		private readonly _channel: string,
		private readonly _unsubscribe: (subscription: RedisSubscription<TMessage>) => Promise<void>,
	) {
		super();
		this.on("error", () => undefined);
	}

	public async unsubscribe(): Promise<void> {
		if (this._closed) return;
		this._closed = true;
		await this._unsubscribe(this);
	}

	public notifyMessage(message: TMessage): void {
		if (!this._closed) this.emit("message", { channel: this._channel, message: message });
	}

	public notifyReady(): void {
		if (!this._closed) this.emit("subscribe", this._channel);
	}

	public notifyUnavailable(): void {
		if (!this._closed) this.emit("error", new RedisCommandError());
	}
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
	private readonly _commandClient: RedisClientType;
	private readonly _logger = new Logger(RedisService.name);
	private readonly _subscriberClient: RedisClientType;
	private _subscriberConnection: Promise<void> | null = null;
	private readonly _subscriptions = new Map<string, RedisSubscriptionRecord>();
	private _destroyed = false;

	public constructor(@Inject(redisConfig.KEY) config: IRedisConfig) {
		const socket = config.url.startsWith("rediss://")
			? { ...(config.caCertificate === undefined ? {} : { ca: config.caCertificate }), tls: true as const }
			: undefined;
		this._commandClient = createClient({
			password: config.password,
			...(socket === undefined ? {} : { socket: socket }),
			url: config.url,
			username: config.username,
		});
		this._subscriberClient = this._commandClient.duplicate();
		this._commandClient.on("error", () => undefined);
		this._subscriberClient.on("error", () => this._markSubscriptionsUnavailable());
		this._subscriberClient.on("ready", () => this._markSubscriptionsReady());
	}

	public async onModuleInit(): Promise<void> {
		await this._commandClient.connect();
		try {
			await this._ensureSubscriberConnected();
		} catch {
			this._logger.warn("The shared Redis subscriber is unavailable; authoritative reads remain active");
		}
	}

	public async onModuleDestroy(): Promise<void> {
		this._destroyed = true;
		this._markSubscriptionsUnavailable();
		this._subscriptions.clear();
		await Promise.allSettled([
			this._commandClient.isOpen ? this._commandClient.close() : Promise.resolve(),
			this._subscriberClient.isOpen ? this._subscriberClient.close() : Promise.resolve(),
		]);
	}

	public createScript<TResult>(script: string): RedisScript<TResult> {
		const sha = createHash("sha1").update(script).digest("hex");
		return {
			script: script,
			exec: async (keys, args) => {
				try {
					return (await this._commandClient.evalSha(sha, { arguments: args, keys: keys })) as TResult;
				} catch (error) {
					if (!(error instanceof Error) || !error.message.includes("NOSCRIPT")) throw new RedisCommandError();
					return this.eval<string[], TResult>(script, keys, args);
				}
			},
		};
	}

	public async eval<TKey extends string[], TResult>(script: string, keys: TKey, args: string[]): Promise<TResult> {
		try {
			return (await this._commandClient.eval(script, { arguments: args, keys: keys })) as TResult;
		} catch {
			throw new RedisCommandError();
		}
	}

	public async hgetall<TResult extends Record<string, string>>(key: string): Promise<TResult | null> {
		try {
			const value = await this._commandClient.hGetAll(key);
			return Object.keys(value).length === 0 ? null : (value as TResult);
		} catch {
			throw new RedisCommandError();
		}
	}

	public async ping(): Promise<string> {
		try {
			return await this._commandClient.ping();
		} catch {
			throw new RedisCommandError();
		}
	}

	public async preloadScripts(scripts: readonly string[]): Promise<void> {
		try {
			await Promise.all(scripts.map((script) => this._commandClient.scriptLoad(script)));
		} catch {
			throw new RedisCommandError();
		}
	}

	public async set(key: string, value: string, options: RedisSetOptions = {}): Promise<string | null> {
		try {
			return await this._commandClient.set(key, value, {
				...(options.nx === true ? { NX: true } : {}),
				...(options.px === undefined ? {} : { PX: options.px }),
			});
		} catch {
			throw new RedisCommandError();
		}
	}

	public subscribe<TMessage>(channel: string): RedisSubscription<TMessage> {
		if (this._destroyed) throw new RedisCommandError();
		const subscription = new RedisSubscription<TMessage>(channel, (listener) =>
			this._unsubscribe({ channel: channel, listener: listener as RedisSubscription<unknown> }),
		);
		const existing = this._subscriptions.get(channel);
		if (existing !== undefined) {
			existing.listeners.add(subscription as RedisSubscription<unknown>);
			if (existing.ready) queueMicrotask(() => subscription.notifyReady());
			return subscription;
		}

		const record: RedisSubscriptionRecord = {
			activation: Promise.resolve(),
			listeners: new Set([subscription as RedisSubscription<unknown>]),
			ready: false,
			subscribed: false,
		};
		record.activation = this._activateChannel({ channel: channel, record: record });
		this._subscriptions.set(channel, record);
		return subscription;
	}

	private async _activateChannel(params: { channel: string; record: RedisSubscriptionRecord }): Promise<void> {
		try {
			await this._ensureSubscriberConnected();
			await this._subscriberClient.subscribe(params.channel, (message) => {
				for (const listener of params.record.listeners) listener.notifyMessage(message);
			});
			params.record.subscribed = true;
			params.record.ready = true;
			for (const listener of params.record.listeners) listener.notifyReady();
		} catch {
			for (const listener of params.record.listeners) listener.notifyUnavailable();
			if (this._subscriptions.get(params.channel) === params.record) this._subscriptions.delete(params.channel);
		}
	}

	private async _ensureSubscriberConnected(): Promise<void> {
		if (this._subscriberClient.isOpen) return;
		if (this._subscriberConnection !== null) return this._subscriberConnection;
		this._subscriberConnection = this._subscriberClient.connect().then(() => undefined);
		try {
			await this._subscriberConnection;
		} finally {
			this._subscriberConnection = null;
		}
	}

	private _markSubscriptionsReady(): void {
		for (const record of this._subscriptions.values()) {
			if (!record.subscribed) continue;
			record.ready = true;
			for (const listener of record.listeners) listener.notifyReady();
		}
	}

	private _markSubscriptionsUnavailable(): void {
		for (const record of this._subscriptions.values()) {
			record.ready = false;
			for (const listener of record.listeners) listener.notifyUnavailable();
		}
	}

	private async _unsubscribe(params: { channel: string; listener: RedisSubscription<unknown> }): Promise<void> {
		const record = this._subscriptions.get(params.channel);
		if (record === undefined) return;
		record.listeners.delete(params.listener);
		if (record.listeners.size > 0) return;
		await record.activation;
		if (this._subscriptions.get(params.channel) !== record) return;
		this._subscriptions.delete(params.channel);
		if (record.subscribed && this._subscriberClient.isOpen) await this._subscriberClient.unsubscribe(params.channel);
	}
}
