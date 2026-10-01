import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import type { LandmarkCompositor } from "../landmarks/landmark-compositor";
import { buildLandmarkOverlay } from "../landmarks/landmark-overlay";
import { selectLandmarks } from "../landmarks/landmark-selection";
import type { LandmarkRepository } from "../landmarks/landmark.repository";
import type { MapImageInput } from "./map-image-input.interface";
import { MapRendering } from "./map-rendering";
import type { MapRepository } from "./map.repository";
import { getMapCoordinates } from "./web-mercator";

export class MapService {
	private readonly _repository: () => MapRepository;
	private readonly _landmarks: () => LandmarkRepository;
	private readonly _compositor: () => Pick<LandmarkCompositor, "renderJpeg">;

	constructor(params: {
		repository: () => MapRepository;
		landmarks: () => LandmarkRepository;
		compositor: () => Pick<LandmarkCompositor, "renderJpeg">;
	}) {
		this._repository = params.repository;
		this._landmarks = params.landmarks;
		this._compositor = params.compositor;
	}

	/** Generates the stored map image: the styled base map with pins for the best-known places around the center. */
	async generateImage(params: MapImageInput): Promise<Uint8Array> {
		const tall = params.size.height > params.size.width;
		const visibleHeight = tall
			? params.size.height * MapRendering.landmarks.tallImageVisibleFraction
			: params.size.height;
		const area = {
			left: 0,
			right: params.size.width,
			top: (params.size.height - visibleHeight) / 2,
			bottom: (params.size.height + visibleHeight) / 2,
		};
		const corner = (pixel: { x: number; y: number }) =>
			getMapCoordinates({ pixel: pixel, center: params.center, size: params.size, zoom: MapRendering.zoom });
		const northWest = corner({ x: area.left, y: area.top });
		const southEast = corner({ x: area.right, y: area.bottom });

		// Both lookups start inside async functions, so a failing provider factory rejects through Promise.all
		// instead of throwing synchronously and leaving the other lookup's rejection unhandled.
		const [baseImage, places] = await Promise.all([
			this._readBaseImage(params),
			(async () =>
				this._landmarks().findPlaces({
					bounds: {
						north: northWest.latitude,
						south: southEast.latitude,
						east: southEast.longitude,
						west: northWest.longitude,
					},
				}))(),
		]);
		const landmarks = selectLandmarks({
			places: places,
			center: params.center,
			size: params.size,
			zoom: MapRendering.zoom,
			area: area,
			maxLandmarks: tall ? MapRendering.landmarks.maxPerTallImage : MapRendering.landmarks.maxPerSquareImage,
		});
		// Re-encoding costs CPU and quality, so an area without known places keeps the provider image untouched.
		if (landmarks.length === 0) return baseImage;

		try {
			return await this._compositor().renderJpeg({
				svg: buildLandmarkOverlay({
					baseImage: baseImage,
					landmarks: landmarks,
					size: params.size,
					density: params.density,
				}),
			});
		} catch {
			throw new GeoimageError(GeoimageErrorCode.INTERNAL_ERROR);
		}
	}

	private async _readBaseImage(params: MapImageInput): Promise<Uint8Array> {
		const stream = await this._repository().getImage(params);
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		try {
			for (;;) {
				const chunk = await reader.read();
				if (chunk.done) break;
				size += chunk.value.length;
				if (size > 8 * 1024 * 1024) {
					await reader.cancel();
					throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);
				}
				chunks.push(chunk.value);
			}
		} catch (error) {
			if (error instanceof GeoimageError) throw error;
			throw new GeoimageError(
				error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
					? GeoimageErrorCode.PROVIDER_TIMEOUT
					: GeoimageErrorCode.PROVIDER_UNAVAILABLE,
			);
		} finally {
			reader.releaseLock();
		}
		if (size === 0) throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		chunks.length = 0;
		return bytes;
	}
}
