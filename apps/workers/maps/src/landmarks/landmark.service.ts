import { MapsErrorCode } from "../shared/maps-error-code.enum";
import { MapsError } from "../shared/maps.error";
import type { LandmarkCompositor } from "./landmark-compositor";
import { buildLandmarkOverlay } from "./landmark-overlay";
import { selectLandmarks } from "./landmark-selection";
import type { LandmarkRepository } from "./landmark.repository";
import { StaticOutputs } from "../modules/static/static-outputs";
import { StaticStyle } from "../modules/static/static-style";
import type { StaticRepository } from "../modules/static/static.repository";
import { getMapCoordinates } from "../modules/static/web-mercator";

export class LandmarkService {
	private readonly _repository: () => Pick<StaticRepository, "generateImage">;
	private readonly _landmarks: () => LandmarkRepository;
	private readonly _compositor: () => Pick<LandmarkCompositor, "renderPng">;

	constructor(params: {
		repository: () => Pick<StaticRepository, "generateImage">;
		landmarks: () => LandmarkRepository;
		compositor: () => Pick<LandmarkCompositor, "renderPng">;
	}) {
		this._repository = params.repository;
		this._landmarks = params.landmarks;
		this._compositor = params.compositor;
	}

	/** Generates the stored map image: the styled base map with pins for the best-known places around the center. */
	async generateImage(params: Parameters<StaticRepository["generateImage"]>[0]): Promise<Uint8Array> {
		const tall = params.size.height > params.size.width;
		const visibleHeight = tall
			? params.size.height * StaticStyle.landmarks.tallImageVisibleFraction
			: params.size.height;
		const area = {
			left: 0,
			right: params.size.width,
			top: (params.size.height - visibleHeight) / 2,
			bottom: (params.size.height + visibleHeight) / 2,
		};
		const corner = (pixel: { x: number; y: number }) =>
			getMapCoordinates({ pixel: pixel, center: params.center, size: params.size, zoom: StaticStyle.zoom });
		const northWest = corner({ x: area.left, y: area.top });
		const southEast = corner({ x: area.right, y: area.bottom });

		// Both lookups start inside async functions, so a failing provider factory rejects through Promise.all
		// instead of throwing synchronously and leaving the other lookup's rejection unhandled.
		const [baseImage, places] = await Promise.all([
			(async () => this._repository().generateImage(params))(),
			(async () =>
				this._landmarks().findPlaces({
					bounds: {
						north: northWest.latitude,
						south: southEast.latitude,
						east: southEast.longitude,
						west: northWest.longitude,
					},
					signal: params.signal,
				}))(),
		]);
		const landmarks = selectLandmarks({
			places: places,
			center: params.center,
			size: params.size,
			zoom: StaticStyle.zoom,
			area: area,
			maxLandmarks: tall ? StaticStyle.landmarks.maxPerTallImage : StaticStyle.landmarks.maxPerSquareImage,
		});
		// Re-encoding costs CPU and quality, so an area without known places keeps the provider image untouched.
		if (landmarks.length === 0) return baseImage;

		try {
			return await this._compositor().renderPng({
				svg: buildLandmarkOverlay({
					baseImage: baseImage,
					landmarks: landmarks,
					size: params.size,
					density: StaticOutputs.scaleFactor,
				}),
			});
		} catch {
			throw new MapsError({ errorCode: MapsErrorCode.TRANSFORMATION_UNAVAILABLE, retryable: false });
		}
	}
}
