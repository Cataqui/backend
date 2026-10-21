import * as td from "testdouble";
import type { HealthIndicatorResult, HealthIndicatorService } from "@nestjs/terminus";
import type { RedisService } from "../../core/redis/redis.service";
import { RedisHealthIndicator } from "./redis-health.indicator";

afterEach(() => td.reset());

describe("RedisHealthIndicator", () => {
	const upResult: HealthIndicatorResult<"redis", "up", { marker: string }> = {
		redis: { status: "up", marker: "healthy-result" },
	};
	const downResult: HealthIndicatorResult<"redis", "down", { marker: string; message: "Redis connection failed" }> = {
		redis: { status: "down", marker: "unhealthy-result", message: "Redis connection failed" },
	};
	let session: ReturnType<HealthIndicatorService["check"]>;
	let indicator: HealthIndicatorService;
	let redis: RedisService;
	let subject: RedisHealthIndicator;

	beforeEach(() => {
		session = td.object<ReturnType<HealthIndicatorService["check"]>>();
		indicator = td.object<HealthIndicatorService>();
		redis = td.object<RedisService>();
		td.when(indicator.check("redis")).thenReturn(session);
		subject = new RedisHealthIndicator(redis, indicator);
	});

	it("marks the Redis check as healthy when the provider answers PONG", async () => {
		td.when(redis.ping()).thenResolve("PONG");
		td.when(session.up()).thenReturn(upResult);
		const result = await subject.pingCheck();
		expect({
			result: result,
			checks: td.explain(indicator.check).calls.map((call) => call.args),
			pings: td.explain(redis.ping).callCount,
			ups: td.explain(session.up).calls.map((call) => call.args),
			downs: td.explain(session.down).calls.map((call) => call.args),
		}).toEqual({ result: upResult, checks: [["redis"]], pings: 1, ups: [[]], downs: [] });
	});

	it("marks the Redis check as unhealthy when the provider returns an unexpected response", async () => {
		td.when(redis.ping()).thenResolve("unexpected");
		td.when(session.down("Redis connection failed")).thenReturn(downResult);
		const result = await subject.pingCheck();
		expect({
			result: result,
			checks: td.explain(indicator.check).calls.map((call) => call.args),
			pings: td.explain(redis.ping).callCount,
			ups: td.explain(session.up).calls.map((call) => call.args),
			downs: td.explain(session.down).calls.map((call) => call.args),
		}).toEqual({ result: downResult, checks: [["redis"]], pings: 1, ups: [], downs: [["Redis connection failed"]] });
	});

	it("reports an unhealthy Redis check without passing provider errors to the health dependency", async () => {
		td.when(redis.ping()).thenReject(new Error("private Upstash details"));
		td.when(session.down("Redis connection failed")).thenReturn(downResult);
		const result = await subject.pingCheck();
		expect({
			result: result,
			checks: td.explain(indicator.check).calls.map((call) => call.args),
			pings: td.explain(redis.ping).callCount,
			ups: td.explain(session.up).calls.map((call) => call.args),
			downs: td.explain(session.down).calls.map((call) => call.args),
		}).toEqual({ result: downResult, checks: [["redis"]], pings: 1, ups: [], downs: [["Redis connection failed"]] });
	});
});
