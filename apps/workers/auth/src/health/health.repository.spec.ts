import type { Redis } from "@upstash/redis";
import * as td from "testdouble";
import type { PrismaClient } from "../generated/prisma/client";
import { HealthRepository } from "./health.repository";

afterEach(() => td.reset());

describe("HealthRepository", () => {
	it("executes a lightweight database read and returns the raw result", async () => {
		const prisma = td.object<PrismaClient>();
		const result = [{ value: 1 }];
		td.when(prisma.$queryRaw(td.matchers.anything())).thenResolve(result);

		expect(await new HealthRepository(prisma, td.object<Redis>()).readDatabase()).toBe(result);
		expect(td.explain(prisma.$queryRaw).calls[0]?.args[0]).toEqual(["SELECT 1"]);
	});

	it("returns the Redis ping result without translating it", async () => {
		const redis = td.object<Redis>();
		td.when(redis.ping()).thenResolve("PONG");

		expect(await new HealthRepository(td.object<PrismaClient>(), redis).readRedis()).toBe("PONG");
	});

	it("preserves provider failures", async () => {
		const redis = td.object<Redis>();
		const failure = new Error("redis unavailable");
		td.when(redis.ping()).thenReject(failure);

		await expect(new HealthRepository(td.object<PrismaClient>(), redis).readRedis()).rejects.toBe(failure);
	});
});
