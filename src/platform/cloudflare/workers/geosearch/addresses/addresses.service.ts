import type { z } from "zod";
import { AddressesRepository } from "./addresses.repository";
import { AddressDetailsRateLimitedError } from "./errors/address-details-rate-limited.error";
import { AddressNotFoundError } from "./errors/address-not-found.error";
import { AddressProviderTimeoutError } from "./errors/address-provider-timeout.error";
import { AddressProviderUnavailableError } from "./errors/address-provider-unavailable.error";
import { AddressSearchRateLimitedError } from "./errors/address-search-rate-limited.error";
import type { AddressDetailsInputSchema } from "./schemas/address-details-input.schema";
import type { AddressDetailsOutputSchema } from "./schemas/address-details-output.schema";
import type { AddressSearchInputSchema } from "./schemas/address-search-input.schema";
import { AddressSearchOutputSchema } from "./schemas/address-search-output.schema";

export class AddressesService {
	constructor(params?: { repository?: AddressesRepository }) {
		this._repository = params?.repository ?? new AddressesRepository();
	}

	private readonly _repository: AddressesRepository;

	async getAddressDetails(params: {
		apiKey: string;
		input: z.infer<typeof AddressDetailsInputSchema>;
		rateLimitKey: string;
		rateLimiter: RateLimit;
	}): Promise<z.infer<typeof AddressDetailsOutputSchema>> {
		const rateLimit = await params.rateLimiter.limit({ key: params.rateLimitKey });

		if (!rateLimit.success) {
			throw new AddressDetailsRateLimitedError();
		}

		const result = await this._repository.getAddressDetails({
			addressId: params.input.addressId,
			apiKey: params.apiKey,
			sessionToken: params.input.sessionToken,
		});

		switch (result.kind) {
			case "SUCCESS":
				return result.output;
			case "ADDRESS_NOT_FOUND":
				throw new AddressNotFoundError();
			case "TIMEOUT":
				throw new AddressProviderTimeoutError();
			case "UNAVAILABLE":
				throw new AddressProviderUnavailableError();
		}
	}

	async searchAddresses(params: {
		apiKey: string;
		input: z.infer<typeof AddressSearchInputSchema>;
		languageCode: string;
		rateLimitKey: string;
		rateLimiter: RateLimit;
	}): Promise<z.infer<typeof AddressSearchOutputSchema>> {
		if (params.input.query.length === 0) {
			return AddressSearchOutputSchema.parse({ suggestions: [], attribution: this._repository.attribution });
		}

		const rateLimit = await params.rateLimiter.limit({ key: params.rateLimitKey });
		if (!rateLimit.success) {
			throw new AddressSearchRateLimitedError();
		}

		const result = await this._repository.searchAddresses({
			apiKey: params.apiKey,
			languageCode: params.languageCode,
			query: params.input.query,
			sessionToken: params.input.sessionToken,
		});

		switch (result.kind) {
			case "SUCCESS":
				return result.output;
			case "TIMEOUT":
				throw new AddressProviderTimeoutError();
			case "UNAVAILABLE":
				throw new AddressProviderUnavailableError();
		}
	}
}
