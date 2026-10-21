import { GooglePlaceTypesByCategory } from "./google/google-place-category";
import { ProtomapsPlaceTypesByCategory } from "./protomaps/protomaps-place-category";

const _values = {
	AIRPORT: "AIRPORT",
	TRAIN_STATION: "TRAIN_STATION",
	SHOPPING_MALL: "SHOPPING_MALL",
	STADIUM: "STADIUM",
	HOSPITAL: "HOSPITAL",
	EDUCATION: "EDUCATION",
	MUSEUM: "MUSEUM",
	ZOO: "ZOO",
	PLACE_OF_WORSHIP: "PLACE_OF_WORSHIP",
	STREET: "STREET",
	NEIGHBORHOOD: "NEIGHBORHOOD",
	CITY: "CITY",
	CAFE: "CAFE",
	BAR: "BAR",
	COCKTAIL_BAR: "COCKTAIL_BAR",
	WINE_BAR: "WINE_BAR",
	HOOKAH_BAR: "HOOKAH_BAR",
	NIGHT_CLUB: "NIGHT_CLUB",
	AMUSEMENT_PARK: "AMUSEMENT_PARK",
	HAIR_CARE: "HAIR_CARE",
	AUTOMOTIVE_SHOP: "AUTOMOTIVE_SHOP",
	BICYCLE_SHOP: "BICYCLE_SHOP",
	VEHICLE_DEALER: "VEHICLE_DEALER",
	VEHICLE_REPAIR: "VEHICLE_REPAIR",
	VEHICLE_WASH: "VEHICLE_WASH",
	LODGING: "LODGING",
	LIBRARY: "LIBRARY",
	PHARMACY: "PHARMACY",
	GYM: "GYM",
	RACING_VENUE: "RACING_VENUE",
	THEATER: "THEATER",
	MOVIE_THEATER: "MOVIE_THEATER",
	BUS_STATION: "BUS_STATION",
	HELIPORT: "HELIPORT",
	PARKING: "PARKING",
	CHARGING_STATION: "CHARGING_STATION",
	GAS_STATION: "GAS_STATION",
	BANK: "BANK",
	POLICE_STATION: "POLICE_STATION",
	FIRE_STATION: "FIRE_STATION",
	GOVERNMENT_OFFICE: "GOVERNMENT_OFFICE",
	SPORTS_VENUE: "SPORTS_VENUE",
	ATTRACTION: "ATTRACTION",
	RESTAURANT: "RESTAURANT",
	PARK: "PARK",
	SUPERMARKET: "SUPERMARKET",
	STORE: "STORE",
	COMMUNITY_CENTER: "COMMUNITY_CENTER",
	PEDESTRIAN_AREA: "PEDESTRIAN_AREA",
	FERRY_TERMINAL: "FERRY_TERMINAL",
	CLINIC: "CLINIC",
	BUILDING: "BUILDING",
	BRIDGE: "BRIDGE",
	OTHER: "OTHER",
} as const;

export type PlaceCategory = (typeof _values)[keyof typeof _values];
type _ProtomapsKind = (typeof ProtomapsPlaceTypesByCategory)[keyof typeof ProtomapsPlaceTypesByCategory][number];

const _googleCategories = _indexCategories(GooglePlaceTypesByCategory);
const _protomapsCategories = _indexCategories(ProtomapsPlaceTypesByCategory);

export const PlaceCategory = {
	..._values,
	values: Object.freeze(Object.values(_values)),

	toProtomapsKinds(category: PlaceCategory): readonly _ProtomapsKind[] {
		const kindsByCategory: Readonly<Partial<Record<PlaceCategory, readonly _ProtomapsKind[]>>> =
			ProtomapsPlaceTypesByCategory;
		return kindsByCategory[category] ?? [];
	},

	fromGoogle(params: { types: readonly string[] }): PlaceCategory {
		for (const type of params.types) {
			const category = _googleCategories.get(type);
			if (category !== undefined) return category;
		}
		return _values.OTHER;
	},

	fromProtomaps(params: { kind: string; kindDetail: string | null }): PlaceCategory {
		const religiousAttraction =
			params.kind === "attraction" &&
			params.kindDetail !== null &&
			[
				"christian",
				"muslim",
				"jewish",
				"buddhist",
				"hindu",
				"sikh",
				"shinto",
				"taoist",
				"bahai",
				"spiritualist",
			].includes(params.kindDetail);
		if (religiousAttraction) return _values.PLACE_OF_WORSHIP;
		return _protomapsCategories.get(params.kind) ?? _values.OTHER;
	},
} as const;

function _indexCategories(
	typesByCategory: Readonly<Partial<Record<PlaceCategory, readonly string[]>>>,
): ReadonlyMap<string, PlaceCategory> {
	const categories = new Map<string, PlaceCategory>();
	for (const category of Object.values(_values)) {
		for (const placeType of typesByCategory[category] ?? []) categories.set(placeType, category);
	}
	return categories;
}
