import { PlacesRepository } from "./places.repository";
import { PlacesService } from "./places.service";
import { PlaceDetailsRateLimitedError } from "./errors/place-details-rate-limited.error";
import { PlaceNotFoundError } from "./errors/place-not-found.error";
import { PlaceProviderTimeoutError } from "./errors/place-provider-timeout.error";
import { PlaceProviderUnavailableError } from "./errors/place-provider-unavailable.error";
import { PlaceSearchRateLimitedError } from "./errors/place-search-rate-limited.error";

describe("PlacesService", () => {
	let detailsRateLimiter: RateLimit;
	let repository: PlacesRepository;
	let searchRateLimiter: RateLimit;
	let service: PlacesService;

	beforeEach(() => {
		detailsRateLimiter = { limit: vi.fn<RateLimit["limit"]>().mockResolvedValue({ success: true }) };
		searchRateLimiter = { limit: vi.fn<RateLimit["limit"]>().mockResolvedValue({ success: true }) };
		repository = new PlacesRepository({
			apiKey: "provider-key",
			searchRateLimiter: searchRateLimiter,
			detailsRateLimiter: detailsRateLimiter,
			fetchImplementation: vi.fn(),
		});
		vi.spyOn(repository, "getPlaceDetails");
		vi.spyOn(repository, "searchPlaces");
		service = new PlacesService({ repository: repository });
	});

	it("should return an attributed blank search without consuming rate-limit capacity", async () => {
		await expect(
			service.searchPlaces({
				input: { query: "", sessionToken: "session" },
				languageCode: "pt-BR",
				rateLimitKey: "development:user-id",
			}),
		).resolves.toEqual({ suggestions: [], attribution: { text: "Google Maps" } });
		expect(searchRateLimiter.limit).not.toHaveBeenCalled();
		expect(repository.searchPlaces).not.toHaveBeenCalled();
	});

	it("should enforce the search limit before asking the repository", async () => {
		vi.mocked(searchRateLimiter.limit).mockResolvedValue({ success: false });

		await expect(
			service.searchPlaces({
				input: { query: "Place", sessionToken: "session" },
				languageCode: "pt-BR",
				rateLimitKey: "development:user-id",
			}),
		).rejects.toBeInstanceOf(PlaceSearchRateLimitedError);
		expect(repository.searchPlaces).not.toHaveBeenCalled();
	});

	it("should forward a permitted provider-neutral search", async () => {
		const output = { suggestions: [], attribution: { text: "Provider attribution" } };
		vi.mocked(repository.searchPlaces).mockResolvedValue({ kind: "SUCCESS", output: output });

		await expect(
			service.searchPlaces({
				input: { query: "Place", sessionToken: "session" },
				languageCode: "pt-BR",
				rateLimitKey: "development:user-id",
			}),
		).resolves.toBe(output);
		expect(repository.searchPlaces).toHaveBeenCalledWith({
			languageCode: "pt-BR",
			query: "Place",
			sessionToken: "session",
		});
	});

	it("should enforce the details limit before asking the repository", async () => {
		vi.mocked(detailsRateLimiter.limit).mockResolvedValue({ success: false });

		await expect(
			service.getPlaceDetails({
				input: { placeId: "place-id", sessionToken: "session" },
				rateLimitKey: "development:user-id",
			}),
		).rejects.toBeInstanceOf(PlaceDetailsRateLimitedError);
		expect(repository.getPlaceDetails).not.toHaveBeenCalled();
	});

	it.each([
		{
			repositoryKind: "PLACE_NOT_FOUND" as const,
			errorClass: PlaceNotFoundError,
		},
		{ repositoryKind: "TIMEOUT" as const, errorClass: PlaceProviderTimeoutError },
		{
			repositoryKind: "UNAVAILABLE" as const,
			errorClass: PlaceProviderUnavailableError,
		},
	])("should translate $repositoryKind repository failures", async ({ errorClass, repositoryKind }) => {
		vi.mocked(repository.getPlaceDetails).mockResolvedValue({ kind: repositoryKind });

		await expect(
			service.getPlaceDetails({
				input: { placeId: "place-id", sessionToken: "session" },
				rateLimitKey: "development:user-id",
			}),
		).rejects.toBeInstanceOf(errorClass);
	});
});
