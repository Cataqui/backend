import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import type { GeoapifyConfig } from "./geoapify.config";
import type { MapImageInput } from "./map-image-input.interface";
import { MapRendering } from "./map-rendering";

export class MapRepository {
	private readonly _config: GeoapifyConfig;

	constructor(params: { config: GeoapifyConfig }) {
		this._config = params.config;
	}

	async getImage(params: MapImageInput): Promise<ReadableStream<Uint8Array>> {
		const url = new URL("https://maps.geoapify.com/v1/staticmap");
		url.search = new URLSearchParams({
			apiKey: this._config.apiKey,
			center: `lonlat:${params.center.longitude},${params.center.latitude}`,
			style: MapRendering.style,
			width: String(params.size.width),
			height: String(params.size.height),
			scaleFactor: String(params.density),
			zoom: String(MapRendering.zoom),
			format: MapRendering.format,
		}).toString();

		let response: Response;
		try {
			response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
		} catch (error) {
			if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
				throw new GeoimageError(GeoimageErrorCode.PROVIDER_TIMEOUT);
			}
			throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);
		}

		if (
			!response.ok ||
			response.body === null ||
			response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() !== "image/jpeg"
		) {
			throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);
		}
		return response.body;
	}
}
