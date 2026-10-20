import { PlaceCategory } from "../index";
import { ProtomapsPlaceTypesByCategory } from "./protomaps-place-category";

describe("PlaceCategory.toProtomapsKinds", () => {
	it.each([
		{ category: PlaceCategory.EDUCATION, kinds: ["university", "college", "school"] },
		{ category: PlaceCategory.BUILDING, kinds: ["public_building", "building"] },
		{
			category: PlaceCategory.PARK,
			kinds: ["park", "national_park", "garden", "nature_reserve", "recreation_ground", "village_green"],
		},
		{ category: PlaceCategory.OTHER, kinds: [] },
		{ category: PlaceCategory.CAFE, kinds: [] },
	])("returns provider kinds for $category", ({ category, kinds }) => {
		expect(PlaceCategory.toProtomapsKinds(category)).toEqual(kinds);
	});
});

describe("ProtomapsPlaceTypesByCategory", () => {
	it.each(Object.entries(ProtomapsPlaceTypesByCategory))("maps every declared kind for %s", (category, kinds) => {
		for (const kind of kinds) {
			expect(PlaceCategory.fromProtomaps({ kind: kind, kindDetail: null })).toBe(category);
		}
	});
	it("assigns each Protomaps kind to only one category", () => {
		const kinds = Object.values(ProtomapsPlaceTypesByCategory).flat();
		expect(new Set(kinds).size).toBe(kinds.length);
	});
});

describe("PlaceCategory.fromProtomaps", () => {
	it.each([
		["aerodrome", PlaceCategory.AIRPORT],
		["station", PlaceCategory.TRAIN_STATION],
		["bus_station", PlaceCategory.BUS_STATION],
		["mall", PlaceCategory.SHOPPING_MALL],
		["stadium", PlaceCategory.STADIUM],
		["hospital", PlaceCategory.HOSPITAL],
		["university", PlaceCategory.EDUCATION],
		["college", PlaceCategory.EDUCATION],
		["museum", PlaceCategory.MUSEUM],
		["zoo", PlaceCategory.ZOO],
		["place_of_worship", PlaceCategory.PLACE_OF_WORSHIP],
		["park", PlaceCategory.PARK],
		["national_park", PlaceCategory.PARK],
		["garden", PlaceCategory.PARK],
		["nature_reserve", PlaceCategory.PARK],
		["recreation_ground", PlaceCategory.PARK],
		["village_green", PlaceCategory.PARK],
		["supermarket", PlaceCategory.SUPERMARKET],
		["grocery", PlaceCategory.SUPERMARKET],
		["school", PlaceCategory.EDUCATION],
		["library", PlaceCategory.LIBRARY],
		["townhall", PlaceCategory.GOVERNMENT_OFFICE],
		["government", PlaceCategory.GOVERNMENT_OFFICE],
		["courthouse", PlaceCategory.GOVERNMENT_OFFICE],
		["theatre", PlaceCategory.THEATER],
		["attraction", PlaceCategory.ATTRACTION],
		["monument", PlaceCategory.ATTRACTION],
		["artwork", PlaceCategory.ATTRACTION],
		["marketplace", PlaceCategory.STORE],
		["community_centre", PlaceCategory.COMMUNITY_CENTER],
		["pedestrian", PlaceCategory.PEDESTRIAN_AREA],
		["ferry_terminal", PlaceCategory.FERRY_TERMINAL],
		["police", PlaceCategory.POLICE_STATION],
		["fire_station", PlaceCategory.FIRE_STATION],
		["post_office", PlaceCategory.OTHER],
		["clinic", PlaceCategory.CLINIC],
		["pharmacy", PlaceCategory.PHARMACY],
		["fuel", PlaceCategory.GAS_STATION],
		["public_building", PlaceCategory.BUILDING],
		["building", PlaceCategory.BUILDING],
		["bridge", PlaceCategory.BRIDGE],
	] as const)("maps %s to %s", (placeType, category) => {
		expect(PlaceCategory.fromProtomaps({ kind: placeType, kindDetail: null })).toBe(category);
	});

	it.each(["", "unknown", "cafe", "airport", "shopping_mall"])("returns OTHER for unsupported kind %s", (kind) => {
		expect(PlaceCategory.fromProtomaps({ kind: kind, kindDetail: null })).toBe(PlaceCategory.OTHER);
	});
	it.each(["christian", "muslim", "jewish", "buddhist", "hindu", "sikh", "shinto", "taoist", "bahai", "spiritualist"])(
		"classifies an attraction with religion %s as a place of worship",
		(kindDetail) => {
			expect(PlaceCategory.fromProtomaps({ kind: "attraction", kindDetail: kindDetail })).toBe(
				PlaceCategory.PLACE_OF_WORSHIP,
			);
		},
	);
	it.each([null, "", "unknown", "Christian"])("keeps an attraction with detail %s as an attraction", (kindDetail) => {
		expect(PlaceCategory.fromProtomaps({ kind: "attraction", kindDetail: kindDetail })).toBe(PlaceCategory.ATTRACTION);
	});
	it.each([null, "unknown", "buddhist"])("recognizes a place of worship with detail %s", (kindDetail) => {
		expect(PlaceCategory.fromProtomaps({ kind: "place_of_worship", kindDetail: kindDetail })).toBe(
			PlaceCategory.PLACE_OF_WORSHIP,
		);
	});
	it.each([
		{ kind: "museum", category: PlaceCategory.MUSEUM },
		{ kind: "monument", category: PlaceCategory.ATTRACTION },
		{ kind: "artwork", category: PlaceCategory.ATTRACTION },
		{ kind: "unknown", category: PlaceCategory.OTHER },
	])("does not reinterpret $kind based on religious details", ({ kind, category }) => {
		expect(PlaceCategory.fromProtomaps({ kind: kind, kindDetail: "buddhist" })).toBe(category);
	});
});
