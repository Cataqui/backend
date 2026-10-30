import app from "../app";
import { AiErrorCode } from "../errors/ai-error-code.enum";
import type { AiWorkerEnv } from "../../cloudflare.config.ts";
import * as td from "testdouble";

afterEach(() => td.reset());

it.each(["staging", "production", undefined] as const)(
	"does not expose OpenAPI in %s even with a valid user credential",
	async (mode) => {
		const environment = td.object<AiWorkerEnv>();
		if (mode === undefined) Reflect.deleteProperty(environment, "ENVIRONMENT");
		if (mode !== undefined) environment.ENVIRONMENT = mode;
		const auth = td.object<AiWorkerEnv["AUTH"]>();
		environment.AUTH = auth;
		const accessToken = "a".repeat(43);
		td.when(auth.resolveSession({ accessToken: accessToken })).thenResolve({
			accountId: "00000000-0000-4000-8000-000000000001",
		});
		for (const headers of [{}, { Authorization: `Bearer ${accessToken}` }]) {
			const response = await app.request("/openapi.json", { headers: headers }, environment);
			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({ status: 404, errorCode: AiErrorCode.ROUTE_NOT_FOUND });
		}
	},
);

it("serves the generated name-analysis contract without authentication or provider bindings", async () => {
	const response = await app.request("/openapi.json", {}, { ENVIRONMENT: "development" });
	expect(response.status).toBe(200);
	const document = await response.json();
	expect(document).toMatchObject({
		openapi: "3.1.0",
		info: { title: "Cataquí AI", version: "1.0.0" },
		security: [{ bearerSession: [] }],
		paths: {
			"/v1/health": { get: { security: [] } },
			"/v1/inference/name-analysis": {
				post: {
					operationId: "analyzeName",
					parameters: [{ name: "Accept-Language", in: "header", required: true, schema: { type: "string" } }],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: { required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 100 } } },
							},
						},
					},
					responses: {
						"200": {
							content: {
								"application/json": {
									schema: {
										properties: {
											data: {
												required: ["givenName", "meaning"],
												properties: {
													givenName: { anyOf: [{ type: "string", minLength: 1, maxLength: 100 }, { type: "null" }] },
													meaning: { anyOf: [{ type: "string", minLength: 1, maxLength: 160 }, { type: "null" }] },
												},
											},
										},
									},
								},
							},
						},
						"400": { content: { "application/json": { schema: { properties: { violations: {} } } } } },
						"429": { headers: { "Retry-After": { schema: { type: "integer" } } } },
						default: {
							content: {
								"application/json": { schema: { properties: { errorCode: { enum: Object.values(AiErrorCode) } } } },
							},
						},
					},
				},
			},
		},
	});
	expect(document).toHaveProperty("paths./v1/inference/name-analysis");
	expect(document).not.toHaveProperty("paths./v1/inference/name-meaning");
});
