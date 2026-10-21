import { Redis } from "@upstash/redis";
import { injectable } from "tsyringe";
import { PrismaClient } from "../generated/prisma/client";
@injectable()
export class HealthRepository {
	constructor(
		private readonly _prisma: PrismaClient,
		private readonly _redis: Redis,
	) {}
	async readDatabase(): Promise<unknown> {
		return this._prisma.$queryRaw`SELECT 1`;
	}
	async readRedis(): Promise<string> {
		return this._redis.ping();
	}
}
