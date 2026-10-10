import { PlaceCategory } from "../../places/place-category";
import type { PlacesService } from "../../places/places.service";
import type { PlaceAreaSearchOutput } from "../../places/schemas/place-area-search-output.schema";
import type { StaticSize } from "../static-outputs";
import { StaticStyle } from "../static-style";
import { LandmarkCategoryConfig } from "./landmark-category.config";
import { LandmarkLabelPosition } from "./landmark-label-position.enum";
import { LandmarkStyle } from "./landmark-style";
import type { Landmark } from "./landmark.interface";

export class LandmarkService {
	constructor(params: { places: PlacesService }) {
		this._places = params.places;
	}

	private readonly _places: PlacesService;

	// Separate requests prevent busy commercial areas from crowding out important landmarks.
	private readonly _searchGroups: readonly { categories: readonly PlaceCategory[]; limit: number }[] = [
		{ categories: [PlaceCategory.AIRPORT, PlaceCategory.TRAIN_STATION], limit: 60 },
		{
			categories: [
				PlaceCategory.SHOPPING_MALL,
				PlaceCategory.STADIUM,
				PlaceCategory.HOSPITAL,
				PlaceCategory.UNIVERSITY,
				PlaceCategory.ATTRACTION,
				PlaceCategory.MUSEUM,
				PlaceCategory.ZOO,
			],
			limit: 100,
		},
		{ categories: [PlaceCategory.PLACE_OF_WORSHIP], limit: 60 },
		{ categories: [PlaceCategory.PARK], limit: 100 },
		{ categories: [PlaceCategory.SUPERMARKET, PlaceCategory.STORE], limit: 60 },
		{ categories: [PlaceCategory.RESTAURANT], limit: 300 },
	];

	async getLandmarks(params: {
		center: { latitude: number; longitude: number };
		size: { width: number; height: number };
		signal?: AbortSignal | undefined;
	}): Promise<Landmark[]> {
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
		const northWest = this._getMapCoordinates({
			pixel: { x: area.left, y: area.top },
			center: { latitude: params.center.latitude, longitude: params.center.longitude },
			size: { width: params.size.width, height: params.size.height },
			zoom: StaticStyle.zoom,
		});
		const southEast = this._getMapCoordinates({
			pixel: { x: area.right, y: area.bottom },
			center: { latitude: params.center.latitude, longitude: params.center.longitude },
			size: { width: params.size.width, height: params.size.height },
			zoom: StaticStyle.zoom,
		});
		const groups = await Promise.all(
			this._searchGroups.map((group) =>
				this._places.searchPlacesInArea({
					bounds: {
						north: northWest.latitude,
						south: southEast.latitude,
						east: southEast.longitude,
						west: northWest.longitude,
					},
					categories: group.categories,
					limit: group.limit,

					signal: params.signal,
				}),
			),
		);

		return this._placeLandmarks({
			candidates: this._rankPlaces({
				places: groups.flat(),
				center: { latitude: params.center.latitude, longitude: params.center.longitude },
				size: { width: params.size.width, height: params.size.height },
				zoom: StaticStyle.zoom,
				area: area,
			}),
			size: { width: params.size.width, height: params.size.height },
			maxLandmarks: tall ? StaticStyle.landmarks.maxPerTallImage : StaticStyle.landmarks.maxPerSquareImage,
		});
	}

	private _rankPlaces(params: {
		places: Readonly<PlaceAreaSearchOutput>;
		center: { latitude: number; longitude: number };
		size: StaticSize;
		zoom: number;
		area: LandmarkBox;
	}): LandmarkCandidate[] {
		const centerX = params.size.width / 2;
		const centerY = params.size.height / 2;
		const best = new Map<string, LandmarkCandidate>();

		for (const place of params.places) {
			const policy = LandmarkCategoryConfig[place.category];
			if (policy === undefined) continue;
			const transport = place.category === PlaceCategory.AIRPORT || place.category === PlaceCategory.TRAIN_STATION;
			if (!place.notable && place.brand === undefined && !transport) continue;
			if (place.category === PlaceCategory.PARK && !place.notable) continue;
			if (place.category === PlaceCategory.PLACE_OF_WORSHIP && !place.notable) continue;

			const pixel = this._getMapPixel({
				coordinates: { latitude: place.coordinates.latitude, longitude: place.coordinates.longitude },
				center: { latitude: params.center.latitude, longitude: params.center.longitude },
				size: { width: params.size.width, height: params.size.height },
				zoom: params.zoom,
			});
			if (
				pixel.x < params.area.left ||
				pixel.x > params.area.right ||
				pixel.y < params.area.top ||
				pixel.y > params.area.bottom
			) {
				continue;
			}
			const score = policy.priority + (place.notable ? 100 : 0) - Math.hypot(pixel.x - centerX, pixel.y - centerY) / 10;
			// A chain appears once, at its best-scoring branch.
			const identity = (place.brand ?? place.name).toLowerCase();
			const current = best.get(identity);
			if (current === undefined || current.score < score)
				best.set(identity, { place: place, x: pixel.x, y: pixel.y, score: score });
		}

		return [...best.values()].sort((left, right) => right.score - left.score);
	}

	private _placeLandmarks(params: {
		candidates: readonly LandmarkCandidate[];
		size: StaticSize;
		maxLandmarks: number;
	}): Landmark[] {
		const occupied: LandmarkBox[] = [];
		const placed: Landmark[] = [];
		const radius = LandmarkStyle.badgeRadius + LandmarkStyle.badgeStrokeWidth;

		for (const candidate of params.candidates) {
			if (placed.length >= params.maxLandmarks) break;

			const badge = {
				left: candidate.x - radius,
				top: candidate.y - radius,
				right: candidate.x + radius,
				bottom: candidate.y + radius,
			};
			if (this._overlapsAny({ box: badge, others: occupied })) continue;

			const label = this._formatLabel({ place: candidate.place });
			const option = this._getLabelOptions({ x: candidate.x, y: candidate.y, label: label }).find(
				(option) =>
					this._fitsInside({ box: option.bounds, size: params.size }) &&
					!this._overlapsAny({ box: option.bounds, others: occupied }),
			);
			if (option === undefined) continue;

			occupied.push(badge, option.bounds);
			placed.push({
				label: label,
				category: candidate.place.category,
				x: candidate.x,
				y: candidate.y,
				labelPosition: option.position,
			});
		}
		return placed;
	}

	private _getLabelOptions(params: { x: number; y: number; label: string }): {
		position: LandmarkLabelPosition;
		bounds: LandmarkBox;
	}[] {
		const radius = LandmarkStyle.badgeRadius + LandmarkStyle.badgeStrokeWidth;
		const halfLabelHeight = LandmarkStyle.labelFontSize * 0.7;
		const labelWidth =
			params.label.length * LandmarkStyle.labelFontSize * LandmarkStyle.labelCharacterWidth +
			Math.max(0, params.label.length - 1) * LandmarkStyle.labelLetterSpacing;
		const gap = radius + LandmarkStyle.labelGap;

		return [
			{
				position: LandmarkLabelPosition.RIGHT,
				bounds: {
					left: params.x + gap,
					top: params.y - halfLabelHeight,
					right: params.x + gap + labelWidth,
					bottom: params.y + halfLabelHeight,
				},
			},
			{
				position: LandmarkLabelPosition.LEFT,
				bounds: {
					left: params.x - gap - labelWidth,
					top: params.y - halfLabelHeight,
					right: params.x - gap,
					bottom: params.y + halfLabelHeight,
				},
			},
			{
				position: LandmarkLabelPosition.ABOVE,
				bounds: {
					left: params.x - labelWidth / 2,
					top: params.y - radius - 2 * halfLabelHeight - LandmarkStyle.labelGap,
					right: params.x + labelWidth / 2,
					bottom: params.y - radius,
				},
			},
			{
				position: LandmarkLabelPosition.BELOW,
				bounds: {
					left: params.x - labelWidth / 2,
					top: params.y + radius,
					right: params.x + labelWidth / 2,
					bottom: params.y + radius + 2 * halfLabelHeight + LandmarkStyle.labelGap,
				},
			},
		];
	}

	private _formatLabel(params: { place: PlaceAreaSearchOutput[number] }): string {
		const name = params.place.name;
		return name.length > LandmarkStyle.labelMaxLength
			? `${name.slice(0, LandmarkStyle.labelMaxLength - 1).trimEnd()}…`
			: name;
	}

	private _fitsInside(params: { box: LandmarkBox; size: StaticSize }): boolean {
		const { box, size } = params;
		return (
			box.left >= LandmarkStyle.edgeMargin &&
			box.top >= LandmarkStyle.edgeMargin &&
			box.right <= size.width - LandmarkStyle.edgeMargin &&
			box.bottom <= size.height - LandmarkStyle.edgeMargin
		);
	}

	private _overlapsAny(params: { box: LandmarkBox; others: readonly LandmarkBox[] }): boolean {
		const box = params.box;
		return params.others.some(
			(other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
		);
	}

	private _worldSize(zoom: number): number {
		return 256 * 2 ** zoom;
	}

	private _projectX(params: { longitude: number; zoom: number }): number {
		return ((params.longitude + 180) / 360) * this._worldSize(params.zoom);
	}

	private _projectY(params: { latitude: number; zoom: number }): number {
		const sine = Math.sin((params.latitude * Math.PI) / 180);
		return (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * this._worldSize(params.zoom);
	}

	private _getMapPixel(params: {
		coordinates: { latitude: number; longitude: number };
		center: { latitude: number; longitude: number };
		size: { width: number; height: number };
		zoom: number;
	}): { x: number; y: number } {
		return {
			x:
				params.size.width / 2 +
				this._projectX({ longitude: params.coordinates.longitude, zoom: params.zoom }) -
				this._projectX({ longitude: params.center.longitude, zoom: params.zoom }),
			y:
				params.size.height / 2 +
				this._projectY({ latitude: params.coordinates.latitude, zoom: params.zoom }) -
				this._projectY({ latitude: params.center.latitude, zoom: params.zoom }),
		};
	}

	private _getMapCoordinates(params: {
		pixel: { x: number; y: number };
		center: { latitude: number; longitude: number };
		size: { width: number; height: number };
		zoom: number;
	}): { latitude: number; longitude: number } {
		const worldSize = this._worldSize(params.zoom);
		const x =
			this._projectX({ longitude: params.center.longitude, zoom: params.zoom }) +
			params.pixel.x -
			params.size.width / 2;
		const y =
			this._projectY({ latitude: params.center.latitude, zoom: params.zoom }) + params.pixel.y - params.size.height / 2;
		return {
			latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize))) * 180) / Math.PI,
			longitude: (x / worldSize) * 360 - 180,
		};
	}
}

type LandmarkBox = { left: number; top: number; right: number; bottom: number };
type LandmarkCandidate = { place: PlaceAreaSearchOutput[number]; x: number; y: number; score: number };
