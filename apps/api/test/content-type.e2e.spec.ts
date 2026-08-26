import { Body, Controller, Post, Version } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { configureApp } from "../src/core/app.factory";
import { ErrorCode } from "../src/core/errors/error-code.enum";
import { RefreshTokenInputSchema } from "../src/modules/auth/schemas/refresh-token-input.schema";

@Controller("content-type-test")
class ContentTypeTestController {
	@Post("json-body")
	@Version("1")
	withJsonBody(
		@Body({ schema: RefreshTokenInputSchema }) body: z.infer<typeof RefreshTokenInputSchema>,
	): z.infer<typeof RefreshTokenInputSchema> {
		return body;
	}

	@Post("bodyless")
	@Version("1")
	bodyless(): { accepted: true } {
		return { accepted: true };
	}
}

describe("API request content types (e2e)", () => {
	let app: NestFastifyApplication;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [ContentTypeTestController] }).compile();
		app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		await configureApp(app);
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("should accept a JSON request body with application/json", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/v1/content-type-test/json-body",
			headers: { "content-type": "application/json" },
			payload: { refreshToken: "r".repeat(43) },
		});

		expect(response.statusCode).toBe(201);
	});

	it("should reject a request body without Content-Type as unsupported media", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/v1/content-type-test/json-body",
			payload: JSON.stringify({ refreshToken: "r".repeat(43) }),
		});

		expect({ statusCode: response.statusCode, body: response.json() }).toMatchObject({
			statusCode: 415,
			body: { errorCode: ErrorCode.UNSUPPORTED_MEDIA_TYPE, status: 415 },
		});
	});

	it("should reject a text/plain request body as unsupported media", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/v1/content-type-test/json-body",
			headers: { "content-type": "text/plain" },
			payload: JSON.stringify({ refreshToken: "r".repeat(43) }),
		});

		expect({ statusCode: response.statusCode, body: response.json() }).toMatchObject({
			statusCode: 415,
			body: { errorCode: ErrorCode.UNSUPPORTED_MEDIA_TYPE, status: 415 },
		});
	});

	it("should allow a bodyless POST without Content-Type", async () => {
		const response = await app.inject({ method: "POST", url: "/v1/content-type-test/bodyless" });

		expect({ statusCode: response.statusCode, body: response.json() }).toMatchObject({
			statusCode: 201,
			body: { data: { accepted: true } },
		});
	});
});
