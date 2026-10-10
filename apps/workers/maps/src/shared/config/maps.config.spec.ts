import { EnvSchema } from "./env.schema";
import { createMapsConfig } from "./maps.config";
import { PlacesConfigSchema } from "../../modules/places/schemas/places-config.schema";
import { StaticConfigSchema } from "../../modules/static/schemas/static-config.schema";

const _environment = {
	ENVIRONMENT: "development",
	MICROSERVICES_AUTH_JWKS_URL: "http://localhost:3000/v1/auth/microservices/jwks",
	STATIC_BASE_URL: "http://localhost:8787",
	GOOGLE_PLACES_API_KEY: "test-google",
	GEOAPIFY_API_KEY: "test-geoapify",
} as const;

describe("Maps configuration", () => {
	it("gives each capability only its configuration values", () => {
		const configuration = createMapsConfig({ environment: _environment });
		expect(configuration).toEqual({
			placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-geoapify" },
			staticConfig: {
				geoapifyApiKey: "test-geoapify",
				environment: "development",
				baseUrl: "http://localhost:8787",
			},
		});
		expect(PlacesConfigSchema.parse(configuration.placesConfig)).toEqual(configuration.placesConfig);
		expect(StaticConfigSchema.parse(configuration.staticConfig)).toEqual(configuration.staticConfig);
	});

	it.each(["GOOGLE_PLACES_API_KEY", "GEOAPIFY_API_KEY"] as const)(
		"rejects an empty %s before composing services",
		(field) => {
			expect(() => createMapsConfig({ environment: { ..._environment, [field]: "" } })).toThrow();
		},
	);

	it.each([
		{ ENVIRONMENT: "unknown" },
		{ STATIC_BASE_URL: "not-a-url" },
		{ MICROSERVICES_AUTH_JWKS_URL: "not-a-url" },
		{ GOOGLE_PLACES_API_KEY: undefined },
		{ GEOAPIFY_API_KEY: undefined },
	])("rejects invalid environment values %j", (values) => {
		expect(EnvSchema.safeParse({ ..._environment, ...values }).success).toBe(false);
	});

	it("leaves Cloudflare resource bindings outside the parsed configuration", () => {
		expect(EnvSchema.parse({ ..._environment, STATIC_IMAGES: { get: vi.fn() } })).toEqual(_environment);
	});
});
