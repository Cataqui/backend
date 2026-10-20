import { PlaceCategory } from "./index";

it("keeps the category type and values independent of conversion methods", () => {
	expectTypeOf<PlaceCategory>().toEqualTypeOf<(typeof PlaceCategory.values)[number]>();
	expectTypeOf<Extract<PlaceCategory, (...args: never[]) => unknown>>().toBeNever();
	expectTypeOf<Parameters<typeof PlaceCategory.fromGoogle>[0]>().toEqualTypeOf<{ types: readonly string[] }>();
	expectTypeOf<Parameters<typeof PlaceCategory.fromProtomaps>[0]>().toEqualTypeOf<{
		kind: string;
		kindDetail: string | null;
	}>();
	expectTypeOf<ReturnType<typeof PlaceCategory.fromGoogle>>().toEqualTypeOf<PlaceCategory>();
	expectTypeOf<ReturnType<typeof PlaceCategory.fromProtomaps>>().toEqualTypeOf<PlaceCategory>();
	expectTypeOf(PlaceCategory.values).toEqualTypeOf<readonly PlaceCategory[]>();
	expectTypeOf<Extract<PlaceCategory, "fromGoogle" | "fromProtomaps" | "values">>().toBeNever();
	expect(PlaceCategory.fromGoogle({ types: ["museum"] as const })).toBe(PlaceCategory.MUSEUM);
	expect(Object.isFrozen(PlaceCategory.values)).toBe(true);
	expect(new Set(PlaceCategory.values).size).toBe(PlaceCategory.values.length);
});

it("serializes categories as their existing public string values", () => {
	expect(JSON.stringify({ category: PlaceCategory.PARK })).toBe('{"category":"PARK"}');
});

it("preserves the public place category vocabulary", () => {
	expect(PlaceCategory.values).toEqual([
		"AIRPORT",
		"TRAIN_STATION",
		"SHOPPING_MALL",
		"STADIUM",
		"HOSPITAL",
		"EDUCATION",
		"MUSEUM",
		"ZOO",
		"PLACE_OF_WORSHIP",
		"STREET",
		"NEIGHBORHOOD",
		"CITY",
		"CAFE",
		"BAR",
		"COCKTAIL_BAR",
		"WINE_BAR",
		"HOOKAH_BAR",
		"NIGHT_CLUB",
		"AMUSEMENT_PARK",
		"HAIR_CARE",
		"AUTOMOTIVE_SHOP",
		"BICYCLE_SHOP",
		"VEHICLE_DEALER",
		"VEHICLE_REPAIR",
		"VEHICLE_WASH",
		"LODGING",
		"LIBRARY",
		"PHARMACY",
		"GYM",
		"RACING_VENUE",
		"THEATER",
		"MOVIE_THEATER",
		"BUS_STATION",
		"HELIPORT",
		"PARKING",
		"CHARGING_STATION",
		"GAS_STATION",
		"BANK",
		"POLICE_STATION",
		"FIRE_STATION",
		"GOVERNMENT_OFFICE",
		"SPORTS_VENUE",
		"ATTRACTION",
		"RESTAURANT",
		"PARK",
		"SUPERMARKET",
		"STORE",
		"COMMUNITY_CENTER",
		"PEDESTRIAN_AREA",
		"FERRY_TERMINAL",
		"CLINIC",
		"BUILDING",
		"BRIDGE",
		"OTHER",
	]);
});
