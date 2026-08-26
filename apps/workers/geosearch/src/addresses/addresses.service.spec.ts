import { AddressesRepository } from "./addresses.repository";
import { AddressesService } from "./addresses.service";
import { AddressDetailsRateLimitedError } from "./errors/address-details-rate-limited.error";
import { AddressNotFoundError } from "./errors/address-not-found.error";
import { AddressProviderTimeoutError } from "./errors/address-provider-timeout.error";
import { AddressProviderUnavailableError } from "./errors/address-provider-unavailable.error";
import { AddressSearchRateLimitedError } from "./errors/address-search-rate-limited.error";

describe("AddressesService", () => {
	let detailsRateLimiter: RateLimit;
	let repository: AddressesRepository;
	let searchRateLimiter: RateLimit;
	let service: AddressesService;

	beforeEach(() => {
		repository = new AddressesRepository({ fetchImplementation: vi.fn() });
		vi.spyOn(repository, "getAddressDetails");
		vi.spyOn(repository, "searchAddresses");
		service = new AddressesService({ repository: repository });
		detailsRateLimiter = { limit: vi.fn().mockResolvedValue({ success: true }) } as never;
		searchRateLimiter = { limit: vi.fn().mockResolvedValue({ success: true }) } as never;
	});

	it("should return an attributed blank search without consuming rate-limit capacity", async () => {
		await expect(
			service.searchAddresses({
				apiKey: "provider-key",
				input: { query: "", sessionToken: "session" },
				languageCode: "pt-BR",
				rateLimitKey: "development:user-id",
				rateLimiter: searchRateLimiter,
			}),
		).resolves.toEqual({ suggestions: [], attribution: { text: "Google Maps" } });
		expect(searchRateLimiter.limit).not.toHaveBeenCalled();
		expect(repository.searchAddresses).not.toHaveBeenCalled();
	});

	it("should enforce the search limit before asking the repository", async () => {
		searchRateLimiter = { limit: vi.fn().mockResolvedValue({ success: false }) } as never;

		await expect(
			service.searchAddresses({
				apiKey: "provider-key",
				input: { query: "Address", sessionToken: "session" },
				languageCode: "pt-BR",
				rateLimitKey: "development:user-id",
				rateLimiter: searchRateLimiter,
			}),
		).rejects.toBeInstanceOf(AddressSearchRateLimitedError);
		expect(repository.searchAddresses).not.toHaveBeenCalled();
	});

	it("should forward a permitted provider-neutral search", async () => {
		const output = { suggestions: [], attribution: { text: "Provider attribution" } };
		vi.mocked(repository.searchAddresses).mockResolvedValue({ kind: "SUCCESS", output: output });

		await expect(
			service.searchAddresses({
				apiKey: "provider-key",
				input: { query: "Address", sessionToken: "session" },
				languageCode: "pt-BR",
				rateLimitKey: "development:user-id",
				rateLimiter: searchRateLimiter,
			}),
		).resolves.toBe(output);
		expect(repository.searchAddresses).toHaveBeenCalledWith({
			apiKey: "provider-key",
			languageCode: "pt-BR",
			query: "Address",
			sessionToken: "session",
		});
	});

	it("should enforce the details limit before asking the repository", async () => {
		detailsRateLimiter = { limit: vi.fn().mockResolvedValue({ success: false }) } as never;

		await expect(
			service.getAddressDetails({
				apiKey: "provider-key",
				input: { addressId: "address-id", sessionToken: "session" },
				rateLimitKey: "development:user-id",
				rateLimiter: detailsRateLimiter,
			}),
		).rejects.toBeInstanceOf(AddressDetailsRateLimitedError);
		expect(repository.getAddressDetails).not.toHaveBeenCalled();
	});

	it.each([
		{
			repositoryKind: "ADDRESS_NOT_FOUND" as const,
			errorClass: AddressNotFoundError,
		},
		{ repositoryKind: "TIMEOUT" as const, errorClass: AddressProviderTimeoutError },
		{
			repositoryKind: "UNAVAILABLE" as const,
			errorClass: AddressProviderUnavailableError,
		},
	])("should translate $repositoryKind repository failures", async ({ errorClass, repositoryKind }) => {
		vi.mocked(repository.getAddressDetails).mockResolvedValue({ kind: repositoryKind });

		await expect(
			service.getAddressDetails({
				apiKey: "provider-key",
				input: { addressId: "address-id", sessionToken: "session" },
				rateLimitKey: "development:user-id",
				rateLimiter: detailsRateLimiter,
			}),
		).rejects.toBeInstanceOf(errorClass);
	});
});
