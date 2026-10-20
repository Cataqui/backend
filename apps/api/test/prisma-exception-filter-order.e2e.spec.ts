import { runtimeConfig } from "../src/core/config/runtime.config";
import { Controller, Get, Version } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { Prisma } from "../generated/prisma/client";
import { configureApp } from "../src/core/app.factory";
import { ErrorCode } from "../src/core/errors/error-code.enum";

@Controller("prisma-filter-order")
class PrismaFilterOrderTestController {
	@Get()
	@Version("1")
	throwKnownPrismaError(): never {
		throw new Prisma.PrismaClientKnownRequestError("Record not found", {
			code: "P2025",
			clientVersion: "test",
		});
	}
}

describe("Prisma exception filter order (e2e)", () => {
	it("should route a known Prisma error through the Prisma-specific filter", async () => {
		const module = await Test.createTestingModule({
			controllers: [PrismaFilterOrderTestController],
			providers: [{ provide: runtimeConfig.KEY, useValue: { environment: "development" } }],
		}).compile();
		const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		await configureApp(app);
		await app.init();

		const response = await app.inject({ method: "GET", url: "/v1/prisma-filter-order" });
		await app.close();

		expect({ statusCode: response.statusCode, errorCode: response.json<{ errorCode: string }>().errorCode }).toEqual({
			statusCode: 404,
			errorCode: ErrorCode.NOT_FOUND,
		});
	});
});
