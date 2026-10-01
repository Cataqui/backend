import app from "../app";

const _env = { GEOAPIFY_API_KEY: "documentation-secret" };

describe("development-only Geoimage documentation", () => {
	it.each(["/docs", "/openapi.json"])("returns an owned 404 for %s without an environment setting", async (path) => {
		const response = await app.request(path, {}, _env);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ errorCode: "ROUTE_NOT_FOUND" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("x-request-id")).toBeTruthy();
	});

	it.each([
		{ path: "/docs", environment: "staging" },
		{ path: "/openapi.json", environment: "staging" },
		{ path: "/docs", environment: "production" },
		{ path: "/openapi.json", environment: "production" },
	])("does not enable $path in $environment through a localhost URL, header, or query", async (params) => {
		const response = await app.request(
			`http://localhost${params.path}?ENVIRONMENT=development`,
			{
				headers: { ENVIRONMENT: "development" },
			},
			{ ..._env, ENVIRONMENT: params.environment },
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ errorCode: "ROUTE_NOT_FOUND" });
	});

	it("serves interactive documentation in the development environment", async () => {
		const response = await app.request("/docs", {}, { ..._env, ENVIRONMENT: "development" });
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
		const html = await response.text();
		expect(html).toContain("SwaggerUIBundle");
		expect(html).toContain("/openapi.json");
		expect(html).not.toContain(_env.GEOAPIFY_API_KEY);
	});

	it("generates the HTTP contract from the validation schemas without provider secrets", async () => {
		const response = await app.request("/openapi.json", {}, { ..._env, ENVIRONMENT: "development" });
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("application/json");
		const spec: { paths: Record<string, unknown>; components: unknown } = await response.json();
		expect(Object.keys(spec.paths).sort()).toEqual(["/v1/health", "/v1/images"]);
		expect(spec.paths["/v1/health"]).toMatchObject({
			get: { responses: { "204": { description: expect.any(String) } } },
		});
		expect(spec.paths["/v1/images"]).toMatchObject({
			get: {
				security: [{ geoimagePermission: [] }],
				parameters: expect.arrayContaining([
					expect.objectContaining({ name: "latitude", in: "query", required: true }),
					expect.objectContaining({ name: "longitude", in: "query", required: true }),
					expect.objectContaining({ name: "size", in: "query", required: true }),
					expect.objectContaining({ name: "density", in: "query", schema: expect.objectContaining({ default: "2" }) }),
				]),
				responses: {
					"200": { content: { "image/jpeg": { schema: { type: "string", format: "binary" } } } },
					"400": {
						content: {
							"application/json": {
								schema: expect.any(Object),
								examples: {
									invalidFields: {
										value: {
											errorCode: "VALIDATION_ERROR",
											violations: [{ path: ["density"], message: "Density must be 1 or 2." }],
										},
									},
								},
							},
						},
					},
					"401": { description: expect.stringContaining("UNAUTHORIZED") },
					"403": { description: expect.stringContaining("FORBIDDEN") },
					"413": expect.any(Object),
					"405": expect.any(Object),
					"500": expect.any(Object),
					"502": expect.any(Object),
					"503": { description: expect.stringContaining("AUTH_UNAVAILABLE") },
					"504": expect.any(Object),
				},
			},
		});
		expect(spec.components).toMatchObject({
			securitySchemes: { geoimagePermission: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
			schemas: {
				ValidationViolation: {
					additionalProperties: false,
					required: ["path", "message"],
					properties: { path: { type: "array" }, message: { type: "string" } },
				},
			},
		});
		expect(spec.paths["/v1/images"]).toMatchObject({
			head: {
				security: [{ geoimagePermission: [] }],
				operationId: "headImage",
				responses: { "200": { description: expect.any(String) } },
			},
		});

		expect(spec.paths["/v1/images"]).not.toHaveProperty("post");
		const serialized = JSON.stringify(spec);
		expect(serialized).not.toContain(_env.GEOAPIFY_API_KEY);
		expect(serialized).not.toContain("apiKey");
		expect(serialized).not.toContain("maps.geoapify.com");
		expect(serialized).not.toContain('"success"');
	});
});
