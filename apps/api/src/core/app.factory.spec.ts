import { Body, Controller, Post } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { z } from "zod";
import { configureApp } from "./app.factory";
import { runtimeConfig } from "./config/runtime.config";

const _input = z.strictObject({ items: z.array(z.object({ count: z.number().positive("Must be positive.") })) });

@Controller("validation")
class ValidationTestController {
	@Post()
	create(@Body({ schema: _input }) _body: z.output<typeof _input>): void {}
}

it("returns shared array-path violations through the configured Nest validation pipe without submitted unknown keys", async () => {
	const module = await Test.createTestingModule({
		controllers: [ValidationTestController],
		providers: [{ provide: runtimeConfig.KEY, useValue: { environment: "production" } }],
	}).compile();
	const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
	try {
		await configureApp(app);
		await app.init();
		const response = await app.inject({
			method: "POST",
			url: "/v1/validation",
			payload: { items: [{ count: -1 }], "submitted-secret-key": true },
		});
		expect(response.statusCode).toBe(400);
		expect(response.json()).toMatchObject({
			errorCode: "VALIDATION_ERROR",
			violations: [
				{ path: ["items", 0, "count"], message: "Must be positive." },
				{ path: [], message: "Only documented fields are supported." },
			],
		});
		expect(response.body).not.toContain("submitted-secret-key");
	} finally {
		await app.close();
	}
});
