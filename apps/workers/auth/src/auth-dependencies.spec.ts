import { AuthSchedules } from "./schedules";
import { UnregisteredScheduleError } from "./errors/unregistered-schedule.error";
import type { AuthWorkerEnv } from "../cloudflare.config.ts";
import { AuthErrorResponseOutputSchema } from "./http/auth-error-response-output.schema";
import { Redis } from "@upstash/redis";
import { container, type DependencyContainer } from "tsyringe";
import * as td from "testdouble";
import { AccountService } from "./account/account.service";
import { registerAuthDependencies } from "./auth-dependencies";
import { AuthDatabase } from "./database/auth-database";
import { PrismaClient } from "./generated/prisma/client";
import { HealthService } from "./health/health.service";
import { NotpService } from "./notp/notp.service";
import { SessionService } from "./session/session.service";
import { TokenConfig } from "./session/token.config";
import { AuthEnvironment } from "./environment.config";
import { DatabaseConfig } from "./database/database.config";
import { NotpConfig } from "./notp/notp.config";
import { RedisConfig } from "./redis/redis.config";
import { MetaWebhookConfig } from "./whatsapp/meta-webhook.config";
import { WhatsappService } from "./whatsapp/whatsapp.service";

const { constructPrisma, constructRedis, disconnect, readDatabase, ping, readSession, deleteExpired } =
	await vi.hoisted(async () => {
		const td = await import("testdouble");
		return {
			constructPrisma: td.func<(options: object) => void>(),
			constructRedis: td.func<(options: object) => void>(),
			disconnect: td.func<() => Promise<void>>(),
			readDatabase: td.func<(query: TemplateStringsArray) => Promise<unknown>>(),
			ping: td.func<() => Promise<string>>(),
			readSession:
				td.func<(key: string) => Promise<{ session_id: string; account_id: string; expires_at: string } | null>>(),
			deleteExpired: td.func<(input: object) => Promise<{ count: number }>>(),
		};
	});
vi.mock("./generated/prisma/client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./generated/prisma/client")>();
	return {
		...actual,
		PrismaClient: class {
			readonly $disconnect = disconnect;
			readonly $queryRaw = readDatabase;
			readonly session = { deleteMany: deleteExpired };
			constructor(options: object) {
				constructPrisma(options);
			}
		},
	};
});
vi.mock("@upstash/redis", () => ({
	Redis: class {
		readonly ping = ping;
		readonly hgetall = readSession;
		constructor(options: object) {
			constructRedis(options);
		}
	},
}));

let scope: DependencyContainer;
beforeEach(() => {
	scope = container.createChildContainer();
});
afterEach(async () => {
	await scope.dispose();
	td.reset();
});

function _environment(): AuthWorkerEnv {
	return Object.assign(td.object<AuthWorkerEnv>(), {
		DB: Object.assign(td.object<Hyperdrive>(), { connectionString: "postgres://auth:password@hyperdrive/auth" }),
		UPSTASH_REDIS_REST_URL: "https://redis.example.test",
		UPSTASH_REDIS_REST_TOKEN: "redis-token",
		AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: "signing-key",
		WHATSAPP_NOTP_RECEIVER: "+15556625497",
		WHATSAPP_NOTP_PHONE_NUMBER_ID: "notp-number",
		META_APP_SECRET: "test-secret",
		WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: "verify-token",
	});
}

it("registers resources without constructing database or Redis clients", () => {
	registerAuthDependencies({ container: scope, environment: _environment() });
	expect({ prisma: td.explain(constructPrisma).callCount, redis: td.explain(constructRedis).callCount }).toEqual({
		prisma: 0,
		redis: 0,
	});
});
it("constructs the complete owned service graph through constructor metadata", () => {
	registerAuthDependencies({ container: scope, environment: _environment() });
	expect(
		[
			scope.resolve(AccountService),
			scope.resolve(HealthService),
			scope.resolve(NotpService),
			scope.resolve(SessionService),
			scope.resolve(WhatsappService),
		].map((service) => service.constructor),
	).toEqual([AccountService, HealthService, NotpService, SessionService, WhatsappService]);
});
it("keeps stateless services transient", () => {
	registerAuthDependencies({ container: scope, environment: _environment() });
	expect(scope.resolve(AccountService)).not.toBe(scope.resolve(AccountService));
});
it("shares the database resource owner within an invocation", () => {
	registerAuthDependencies({ container: scope, environment: _environment() });
	expect(scope.resolve(AuthDatabase)).toBe(scope.resolve(AuthDatabase));
});
it("supplies the same Prisma client to every resolution in an invocation", () => {
	registerAuthDependencies({ container: scope, environment: _environment() });
	expect(scope.resolve(PrismaClient)).toBe(scope.resolve(AuthDatabase).client);
});
it("shares the Redis client within an invocation with dedicated Auth credentials", () => {
	registerAuthDependencies({ container: scope, environment: _environment() });
	scope.resolve(Redis);
	scope.resolve(Redis);
	expect(td.explain(constructRedis).calls.map((call) => call.args)).toEqual([
		[{ url: "https://redis.example.test", token: "redis-token", enableAutoPipelining: false }],
	]);
});
it("keeps token configuration in the invocation scope", () => {
	const environment = _environment();
	environment.AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL = "request-key";
	registerAuthDependencies({ container: scope, environment: environment });
	expect(scope.resolve<TokenConfig>(TokenConfig)).toEqual({
		refreshTokenHmacCurrentKid: "V1",
		refreshTokenHmacKeys: { V1: "request-key" },
	});
});
it("resolves feature configuration from each invocation without sharing cached credentials", async () => {
	const firstEnvironment = _environment();
	const secondEnvironment = _environment();
	secondEnvironment.AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL = "second-signing-key";
	secondEnvironment.META_APP_SECRET = "second-secret";
	secondEnvironment.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN = "second-verify-token";
	secondEnvironment.WHATSAPP_NOTP_RECEIVER = "+15550000002";
	secondEnvironment.WHATSAPP_NOTP_PHONE_NUMBER_ID = "second-number";
	secondEnvironment.UPSTASH_REDIS_REST_URL = "https://second-redis.example.test";
	secondEnvironment.UPSTASH_REDIS_REST_TOKEN = "second-redis-token";
	secondEnvironment.DB = Object.assign(td.object<Hyperdrive>(), {
		connectionString: "postgres://auth:password@second-hyperdrive/auth",
	});
	const other = container.createChildContainer();
	registerAuthDependencies({ container: scope, environment: firstEnvironment });
	registerAuthDependencies({ container: other, environment: secondEnvironment });
	try {
		for (const [invocation, environment] of [
			[scope, firstEnvironment],
			[other, secondEnvironment],
		] as const) {
			expect(invocation.resolve<TokenConfig>(TokenConfig).refreshTokenHmacKeys).toEqual({
				V1: environment.AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL,
			});
			expect(invocation.resolve<MetaWebhookConfig>(MetaWebhookConfig)).toEqual({
				appSecret: environment.META_APP_SECRET,
				verificationToken: environment.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN,
			});
			expect(invocation.resolve<RedisConfig>(RedisConfig)).toEqual({
				url: environment.UPSTASH_REDIS_REST_URL,
				token: environment.UPSTASH_REDIS_REST_TOKEN,
				enableAutoPipelining: false,
			});
			expect(invocation.resolve<DatabaseConfig>(DatabaseConfig)).toEqual({
				connectionString: environment.DB.connectionString,
			});
			expect(invocation.resolve<NotpConfig>(NotpConfig)).toEqual({
				whatsappPhoneNumber: environment.WHATSAPP_NOTP_RECEIVER,
				whatsappPhoneNumberId: environment.WHATSAPP_NOTP_PHONE_NUMBER_ID,
			});
			for (const token of [TokenConfig, MetaWebhookConfig, RedisConfig, NotpConfig, DatabaseConfig]) {
				expect(invocation.resolve(token)).toBe(invocation.resolve(token));
				expect(scope.resolve(token)).not.toBe(other.resolve(token));
			}
		}
		expect(container.isRegistered(AuthEnvironment)).toBe(false);
	} finally {
		await other.dispose();
	}
});
it("isolates database and Redis resources between invocations", async () => {
	const other = container.createChildContainer();
	registerAuthDependencies({ container: scope, environment: _environment() });
	registerAuthDependencies({ container: other, environment: _environment() });
	try {
		expect({
			database: scope.resolve(AuthDatabase) === other.resolve(AuthDatabase),
			redis: scope.resolve(Redis) === other.resolve(Redis),
		}).toEqual({ database: false, redis: false });
	} finally {
		await other.dispose();
	}
});

import worker, { app } from "./app";
import { AuthEntrypoint } from "./entrypoint";

it("checks readiness through injected clients and disconnects Prisma once", async () => {
	td.when(readDatabase(td.matchers.anything())).thenResolve([{ value: 1 }]);
	td.when(ping()).thenResolve("PONG");
	const response = await app.request("/v1/health", {}, _environment());
	expect({
		status: response.status,
		constructed: td.explain(constructPrisma).callCount,
		closed: td.explain(disconnect).callCount,
	}).toEqual({ status: 200, constructed: 1, closed: 1 });
});
it("disconnects the resolved database when readiness fails", async () => {
	td.when(readDatabase(td.matchers.anything())).thenReject(new Error("database unavailable"));
	td.when(ping()).thenResolve("PONG");
	const response = await app.request("/v1/health", {}, _environment());
	expect({ status: response.status, closed: td.explain(disconnect).callCount }).toEqual({ status: 503, closed: 1 });
});
it("keeps liveness independent of database and Redis construction", async () => {
	const response = await app.request("/v1/health/live", {}, _environment());
	expect({
		status: response.status,
		prisma: td.explain(constructPrisma).callCount,
		redis: td.explain(constructRedis).callCount,
	}).toEqual({ status: 204, prisma: 0, redis: 0 });
});
it("rejects invalid public webhook verification without constructing storage clients", async () => {
	const environment = _environment();
	environment.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN = "verify";
	const response = await app.request(
		"/webhooks/whatsapp?hub.mode=invalid&hub.verify_token=verify&hub.challenge=challenge",
		{},
		environment,
	);
	expect({
		status: response.status,
		prisma: td.explain(constructPrisma).callCount,
		redis: td.explain(constructRedis).callCount,
	}).toEqual({ status: 403, prisma: 0, redis: 0 });
});
it("isolates resources across overlapping HTTP requests", async () => {
	td.when(readDatabase(td.matchers.anything())).thenResolve([{ value: 1 }]);
	td.when(ping()).thenResolve("PONG");
	const responses = await Promise.all(Array.from({ length: 8 }, () => app.request("/v1/health", {}, _environment())));
	expect({
		statuses: responses.map((response) => response.status),
		constructed: td.explain(constructPrisma).callCount,
		closed: td.explain(disconnect).callCount,
	}).toEqual({ statuses: Array(8).fill(200), constructed: 8, closed: 8 });
});
it("disconnects an acquired Prisma client if another dependency fails to construct", async () => {
	td.when(constructRedis(td.matchers.anything())).thenThrow(new Error("Redis construction failed"));
	const response = await app.request("/v1/health", {}, _environment());
	expect({ status: response.status, closed: td.explain(disconnect).callCount }).toEqual({ status: 500, closed: 1 });
});
it("sanitizes a database disposal failure through the HTTP error boundary", async () => {
	td.when(readDatabase(td.matchers.anything())).thenResolve([]);
	td.when(ping()).thenResolve("PONG");
	td.when(disconnect()).thenReject(new Error("private disconnect diagnostic"));
	const response = await app.request("/v1/health", {}, _environment());
	expect({
		status: response.status,
		code: AuthErrorResponseOutputSchema.parse(await response.json()).errorCode,
	}).toEqual({
		status: 500,
		code: "INTERNAL_ERROR",
	});
});
it("disconnects private session RPC resources after successful resolution", async () => {
	td.when(readSession(td.matchers.anything())).thenResolve(null);
	const entrypoint = new AuthEntrypoint(td.object<ExecutionContext>(), _environment());
	const result = await entrypoint.resolveSession({ accessToken: "token" });
	expect({ result: result, closed: td.explain(disconnect).callCount }).toEqual({ result: null, closed: 1 });
});
it("disconnects private session RPC resources when the session lookup fails", async () => {
	const failure = new Error("Redis lookup failed");
	td.when(readSession(td.matchers.anything())).thenReject(failure);
	const entrypoint = new AuthEntrypoint(td.object<ExecutionContext>(), _environment());
	const result = await entrypoint.resolveSession({ accessToken: "token" }).catch((error: unknown): unknown => error);
	expect({ failure: result, closed: td.explain(disconnect).callCount }).toEqual({ failure: failure, closed: 1 });
});
it("disconnects scheduled cleanup resources after the database operation completes", async () => {
	td.when(deleteExpired(td.matchers.anything())).thenResolve({ count: 1 });
	await worker.scheduled(
		Object.assign(td.object<ScheduledController>(), { cron: AuthSchedules.DELETE_EXPIRED_SESSIONS }),
		_environment(),
	);
	expect(td.explain(disconnect).callCount).toBe(1);
});
it("rejects an unknown schedule without constructing database or Redis clients", async () => {
	const event = Object.assign(td.object<ScheduledController>(), { cron: "0 * * * *" });
	await expect(worker.scheduled(event, _environment())).rejects.toBeInstanceOf(UnregisteredScheduleError);
	expect({
		prisma: td.explain(constructPrisma).callCount,
		redis: td.explain(constructRedis).callCount,
		cleanup: td.explain(deleteExpired).callCount,
	}).toEqual({ prisma: 0, redis: 0, cleanup: 0 });
});
it("disconnects scheduled cleanup resources when the database operation fails", async () => {
	const failure = new Error("Session deletion failed");
	td.when(deleteExpired(td.matchers.anything())).thenReject(failure);
	const result = await worker
		.scheduled(
			Object.assign(td.object<ScheduledController>(), { cron: AuthSchedules.DELETE_EXPIRED_SESSIONS }),
			_environment(),
		)
		.catch((error: unknown): unknown => error);
	expect({ failure: result, closed: td.explain(disconnect).callCount }).toEqual({ failure: failure, closed: 1 });
});
