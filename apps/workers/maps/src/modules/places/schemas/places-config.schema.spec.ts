import { PlacesConfigSchema } from "./places-config.schema";

describe("PlacesConfigSchema", () => {
	it("accepts both provider keys", () => {
		const config = { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-geoapify" };
		expect(PlacesConfigSchema.parse(config)).toEqual(config);
	});

	it.each([
		{ googlePlacesApiKey: "", geoapifyApiKey: "test-geoapify" },
		{ googlePlacesApiKey: "test-google", geoapifyApiKey: "" },
		{ geoapifyApiKey: "test-geoapify" },
		{ googlePlacesApiKey: "test-google" },
		{ googlePlacesApiKey: "test-google", geoapifyApiKey: "test-geoapify", apiKey: "unexpected" },
	])("rejects incomplete or unknown configuration %j", (config) => {
		expect(PlacesConfigSchema.safeParse(config).success).toBe(false);
	});
});
