import type { z } from "zod";
import type { GeoapifyRepository } from "./geoapify.repository";
import type { LocationInputSchema } from "./schemas/location-input.schema";

export class LocationsService {
	private readonly _repository: GeoapifyRepository;

	constructor(params: { repository: GeoapifyRepository }) {
		this._repository = params.repository;
	}

	async generateLocationVisual(params: {
		input: z.infer<typeof LocationInputSchema>;
	}): Promise<ReadableStream<Uint8Array>> {
		return this._repository.generateMap({ input: params.input });
	}
}
