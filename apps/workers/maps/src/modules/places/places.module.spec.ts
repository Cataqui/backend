import { createPlacesService } from "./places.module";

describe("createPlacesService", () => {
	it("composes the places service with validated configuration", async () => {
		const service = createPlacesService({
			placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-geoapify" },
			searchRateLimiter: { limit: vi.fn() },
			detailsRateLimiter: { limit: vi.fn() },
		});
		expect(
			await service.searchPlaces({
				input: { query: "", sessionToken: "session" },
				languageCode: "en",
				rateLimitKey: "test:user",
			}),
		).toEqual({ suggestions: [], attribution: { text: "Google Maps" } });
	});
});
