import type { z } from "zod";
import { GeovisualErrorCode } from "../geovisual-error-code.enum";
import { GeovisualError } from "../geovisual.error";
import type { GeoapifyConfig } from "./geoapify.config";
import type { LocationInputSchema } from "./schemas/location-input.schema";

export class GeoapifyRepository {
	private readonly _config: GeoapifyConfig;

	constructor(params: { config: GeoapifyConfig }) {
		this._config = params.config;
	}

	async generateMap(params: { input: z.infer<typeof LocationInputSchema> }): Promise<ReadableStream<Uint8Array>> {
		const url = new URL("https://maps.geoapify.com/v1/staticmap");
		url.search = new URLSearchParams({
			apiKey: this._config.apiKey,
			center: `lonlat:${params.input.longitude},${params.input.latitude}`,
			style: "osm-bright",
			width: String(params.input.map.size.width),
			height: String(params.input.map.size.height),
			scaleFactor: String(params.input.map.density),
			zoom: "13",
			format: "jpeg",
		}).toString();

		let response: Response;
		try {
			response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
		} catch (error) {
			if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
				throw new GeovisualError(GeovisualErrorCode.PROVIDER_TIMEOUT);
			}
			throw new GeovisualError(GeovisualErrorCode.PROVIDER_UNAVAILABLE);
		}

		if (
			!response.ok ||
			response.body === null ||
			response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() !== "image/jpeg"
		) {
			throw new GeovisualError(GeovisualErrorCode.PROVIDER_UNAVAILABLE);
		}
		return response.body;
	}
}
