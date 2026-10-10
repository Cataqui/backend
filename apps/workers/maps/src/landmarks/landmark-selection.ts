import { getMapPixel } from "../modules/static/web-mercator";
import { LandmarkCategories, LandmarkCategory } from "./landmark-category";
import type { LandmarkPlace } from "./landmark-place.interface";
import { LandmarkStyle } from "./landmark-style";

export enum LandmarkLabelPosition {
	RIGHT = "RIGHT",
	LEFT = "LEFT",
	ABOVE = "ABOVE",
	BELOW = "BELOW",
}

export interface PlacedLandmark {
	label: string;
	category: LandmarkCategory;
	x: number;
	y: number;
	labelPosition: LandmarkLabelPosition;
}

type Box = { left: number; top: number; right: number; bottom: number };

// Categories that would crowd out everything else in dense neighborhoods are capped per image.
const CATEGORY_LIMITS: Partial<Record<LandmarkCategory, number>> = {
	[LandmarkCategory.STATION]: 3,
	[LandmarkCategory.RESTAURANT]: 3,
};
// Brazilian stations are often named after a nearby business ("Shopping", "Aeroporto"); a bare category word
// next to a train icon reads like a different place.
const AMBIGUOUS_STATION_NAMES = new Set([
	"aeroporto",
	"centro",
	"estádio",
	"hospital",
	"mercado",
	"rodoviária",
	"shopping",
]);

/**
 * Picks the best-known places around the map center and positions each pin with a label that overlaps nothing
 * already placed. Score = category weight + 100 for places with a Wikidata entry − 1 per 10 logical pixels from
 * the center. Unknown, unbranded places are skipped except airports and stations, which are useful by themselves.
 */
export function selectLandmarks(params: {
	places: readonly LandmarkPlace[];
	center: { latitude: number; longitude: number };
	size: { width: number; height: number };
	zoom: number;
	area: Box;
	maxLandmarks: number;
}): PlacedLandmark[] {
	const centerX = params.size.width / 2;
	const centerY = params.size.height / 2;
	const best = new Map<string, { place: LandmarkPlace; x: number; y: number; score: number }>();

	for (const place of params.places) {
		const transport = place.category === LandmarkCategory.AIRPORT || place.category === LandmarkCategory.STATION;
		if (!place.notable && place.brand === undefined && !transport) continue;
		if (place.category === LandmarkCategory.PARK && !place.notable) continue;

		const pixel = getMapPixel({
			coordinates: place.coordinates,
			center: params.center,
			size: params.size,
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
		const score =
			LandmarkCategories[place.category].weight +
			(place.notable ? 100 : 0) -
			Math.hypot(pixel.x - centerX, pixel.y - centerY) / 10;
		// A chain appears once, at its best-scoring branch.
		const identity = (place.brand ?? place.name).toLocaleLowerCase("pt-BR");
		const current = best.get(identity);
		if (current === undefined || current.score < score) best.set(identity, { place: place, ...pixel, score: score });
	}

	const occupied: Box[] = [];
	const placed: PlacedLandmark[] = [];
	const radius = LandmarkStyle.badgeRadius + LandmarkStyle.badgeStrokeWidth;
	const halfLabelHeight = LandmarkStyle.labelFontSize * 0.7;

	for (const candidate of [...best.values()].sort((left, right) => right.score - left.score)) {
		if (placed.length >= params.maxLandmarks) break;
		const limit = CATEGORY_LIMITS[candidate.place.category];
		if (
			limit !== undefined &&
			placed.filter((landmark) => landmark.category === candidate.place.category).length >= limit
		) {
			continue;
		}

		const badge = {
			left: candidate.x - radius,
			top: candidate.y - radius,
			right: candidate.x + radius,
			bottom: candidate.y + radius,
		};
		if (_overlapsAny(badge, occupied)) continue;

		const label = _formatLabel(candidate.place);
		const labelWidth = label.length * LandmarkStyle.labelFontSize * LandmarkStyle.labelCharacterWidth;
		const gap = radius + LandmarkStyle.labelGap;
		const options: [LandmarkLabelPosition, Box][] = [
			[
				LandmarkLabelPosition.RIGHT,
				{
					left: candidate.x + gap,
					top: candidate.y - halfLabelHeight,
					right: candidate.x + gap + labelWidth,
					bottom: candidate.y + halfLabelHeight,
				},
			],
			[
				LandmarkLabelPosition.LEFT,
				{
					left: candidate.x - gap - labelWidth,
					top: candidate.y - halfLabelHeight,
					right: candidate.x - gap,
					bottom: candidate.y + halfLabelHeight,
				},
			],
			[
				LandmarkLabelPosition.ABOVE,
				{
					left: candidate.x - labelWidth / 2,
					top: candidate.y - radius - 2 * halfLabelHeight - LandmarkStyle.labelGap,
					right: candidate.x + labelWidth / 2,
					bottom: candidate.y - radius,
				},
			],
			[
				LandmarkLabelPosition.BELOW,
				{
					left: candidate.x - labelWidth / 2,
					top: candidate.y + radius,
					right: candidate.x + labelWidth / 2,
					bottom: candidate.y + radius + 2 * halfLabelHeight + LandmarkStyle.labelGap,
				},
			],
		];
		const option = options.find(([, box]) => _fitsInside(box, params.size) && !_overlapsAny(box, occupied));
		if (option === undefined) continue;

		occupied.push(badge, option[1]);
		placed.push({
			label: label,
			category: candidate.place.category,
			x: candidate.x,
			y: candidate.y,
			labelPosition: option[0],
		});
	}
	return placed;
}

function _formatLabel(place: LandmarkPlace): string {
	const name =
		place.category === LandmarkCategory.STATION && AMBIGUOUS_STATION_NAMES.has(place.name.toLocaleLowerCase("pt-BR"))
			? `Estação ${place.name}`
			: place.name;
	return name.length > LandmarkStyle.labelMaxLength
		? `${name.slice(0, LandmarkStyle.labelMaxLength - 1).trimEnd()}…`
		: name;
}

function _fitsInside(box: Box, size: { width: number; height: number }): boolean {
	return (
		box.left >= LandmarkStyle.edgeMargin &&
		box.top >= LandmarkStyle.edgeMargin &&
		box.right <= size.width - LandmarkStyle.edgeMargin &&
		box.bottom <= size.height - LandmarkStyle.edgeMargin
	);
}

function _overlapsAny(box: Box, others: readonly Box[]): boolean {
	return others.some(
		(other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
	);
}
