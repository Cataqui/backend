import { PlaceCategory } from "../index";
import { GooglePlaceTypesByCategory } from "./google-place-category";

describe("PlaceCategory.fromGoogle", () => {
	it.each([
		{ placeType: "community_center", category: PlaceCategory.COMMUNITY_CENTER },
		{ placeType: "ferry_terminal", category: PlaceCategory.FERRY_TERMINAL },
		{ placeType: "bridge", category: PlaceCategory.BRIDGE },
	])("maps the shared reference category for $placeType", ({ placeType, category }) => {
		expect(PlaceCategory.fromGoogle({ types: [placeType] })).toBe(category);
	});

	it.each([
		{ category: PlaceCategory.VEHICLE_REPAIR, placeType: "car_repair" },
		{ category: PlaceCategory.AUTOMOTIVE_SHOP, placeType: "tire_shop" },
		{ category: PlaceCategory.AUTOMOTIVE_SHOP, placeType: "auto_parts_store" },
		{ category: PlaceCategory.VEHICLE_WASH, placeType: "car_wash" },
		{ category: PlaceCategory.VEHICLE_DEALER, placeType: "car_dealer" },
		{ category: PlaceCategory.VEHICLE_DEALER, placeType: "truck_dealer" },
		{ category: PlaceCategory.BICYCLE_SHOP, placeType: "bicycle_store" },
	])("should normalize $placeType as $category", ({ category, placeType }) => {
		expect(PlaceCategory.fromGoogle({ types: [placeType] })).toBe(category);
	});

	it.each(["barber_shop", "hair_salon", "hair_care"])(
		"should normalize %s as the provider-neutral hair care category",
		(placeType) => {
			expect(PlaceCategory.fromGoogle({ types: [placeType] })).toBe(PlaceCategory.HAIR_CARE);
		},
	);

	it.each([
		{ category: PlaceCategory.BAR, placeType: "bar" },
		{ category: PlaceCategory.BAR, placeType: "pub" },
		{ category: PlaceCategory.BAR, placeType: "irish_pub" },
		{ category: PlaceCategory.BAR, placeType: "sports_bar" },
		{ category: PlaceCategory.BAR, placeType: "beer_garden" },
		{ category: PlaceCategory.BAR, placeType: "brewpub" },
		{ category: PlaceCategory.COCKTAIL_BAR, placeType: "cocktail_bar" },
		{ category: PlaceCategory.COCKTAIL_BAR, placeType: "lounge_bar" },
		{ category: PlaceCategory.WINE_BAR, placeType: "wine_bar" },
		{ category: PlaceCategory.HOOKAH_BAR, placeType: "hookah_bar" },
		{ category: PlaceCategory.RESTAURANT, placeType: "gastropub" },
		{ category: PlaceCategory.RESTAURANT, placeType: "bar_and_grill" },
	])("should normalize $placeType as $category", ({ category, placeType }) => {
		expect(PlaceCategory.fromGoogle({ types: [placeType] })).toBe(category);
	});

	it.each([
		"lodging",
		"hotel",
		"hostel",
		"motel",
		"inn",
		"guest_house",
		"bed_and_breakfast",
		"extended_stay_hotel",
		"resort_hotel",
		"private_guest_room",
		"cottage",
		"farmstay",
		"camping_cabin",
		"campground",
		"rv_park",
		"mobile_home_park",
		"japanese_inn",
		"budget_japanese_inn",
	])("should normalize %s as the provider-neutral lodging category", (placeType) => {
		expect(PlaceCategory.fromGoogle({ types: [placeType] })).toBe(PlaceCategory.LODGING);
	});

	it.each(["race_course", "go_karting_venue"])(
		"should normalize %s as the provider-neutral racing venue category",
		(placeType) => {
			expect(PlaceCategory.fromGoogle({ types: [placeType] })).toBe(PlaceCategory.RACING_VENUE);
		},
	);

	it.each([
		{ category: PlaceCategory.NIGHT_CLUB, placeType: "night_club" },
		{ category: PlaceCategory.CAFE, placeType: "cafe" },
		{ category: PlaceCategory.COCKTAIL_BAR, placeType: "cocktail_bar" },
		{ category: PlaceCategory.RESTAURANT, placeType: "restaurant" },
		{ category: PlaceCategory.AMUSEMENT_PARK, placeType: "amusement_park" },
		{ category: PlaceCategory.PARK, placeType: "city_park" },
		{ category: PlaceCategory.SHOPPING_MALL, placeType: "shopping_mall" },
		{ category: PlaceCategory.SUPERMARKET, placeType: "grocery_store" },
		{ category: PlaceCategory.PHARMACY, placeType: "pharmacy" },
		{ category: PlaceCategory.STORE, placeType: "store" },
		{ category: PlaceCategory.EDUCATION, placeType: "university" },
		{ category: PlaceCategory.EDUCATION, placeType: "primary_school" },
		{ category: PlaceCategory.PEDESTRIAN_AREA, placeType: "plaza" },
		{ category: PlaceCategory.PEDESTRIAN_AREA, placeType: "town_square" },
		{ category: PlaceCategory.EDUCATION, placeType: "educational_institution" },
		{ category: PlaceCategory.EDUCATION, placeType: "academic_department" },
		{ category: PlaceCategory.CLINIC, placeType: "medical_clinic" },
		{ category: PlaceCategory.CLINIC, placeType: "medical_center" },
		{ category: PlaceCategory.CLINIC, placeType: "dental_clinic" },
		{ category: PlaceCategory.CLINIC, placeType: "skin_care_clinic" },
		{ category: PlaceCategory.BUILDING, placeType: "apartment_building" },
		{ category: PlaceCategory.ATTRACTION, placeType: "monument" },
		{ category: PlaceCategory.GOVERNMENT_OFFICE, placeType: "city_hall" },
		{ category: PlaceCategory.GOVERNMENT_OFFICE, placeType: "courthouse" },
		{ category: PlaceCategory.GOVERNMENT_OFFICE, placeType: "embassy" },
		{ category: PlaceCategory.LIBRARY, placeType: "library" },
		{ category: PlaceCategory.HOSPITAL, placeType: "hospital" },
		{ category: PlaceCategory.GYM, placeType: "gym" },
		{ category: PlaceCategory.STADIUM, placeType: "stadium" },
		{ category: PlaceCategory.RACING_VENUE, placeType: "race_course" },
		{ category: PlaceCategory.SPORTS_VENUE, placeType: "sports_complex" },
		{ category: PlaceCategory.MUSEUM, placeType: "museum" },
		{ category: PlaceCategory.MOVIE_THEATER, placeType: "movie_theater" },
		{ category: PlaceCategory.THEATER, placeType: "performing_arts_theater" },
		{ category: PlaceCategory.HELIPORT, placeType: "heliport" },
		{ category: PlaceCategory.AIRPORT, placeType: "airport" },
		{ category: PlaceCategory.BUS_STATION, placeType: "bus_station" },
		{ category: PlaceCategory.TRAIN_STATION, placeType: "subway_station" },
		{ category: PlaceCategory.PARKING, placeType: "parking_lot" },
		{ category: PlaceCategory.CHARGING_STATION, placeType: "electric_vehicle_charging_station" },
		{ category: PlaceCategory.GAS_STATION, placeType: "gas_station" },
		{ category: PlaceCategory.BANK, placeType: "bank" },
		{ category: PlaceCategory.POLICE_STATION, placeType: "police" },
		{ category: PlaceCategory.FIRE_STATION, placeType: "fire_station" },
		{ category: PlaceCategory.PLACE_OF_WORSHIP, placeType: "place_of_worship" },
		{ category: PlaceCategory.GOVERNMENT_OFFICE, placeType: "government_office" },
		{ category: PlaceCategory.LODGING, placeType: "hotel" },
		{ category: PlaceCategory.STREET, placeType: "route" },
		{ category: PlaceCategory.STREET, placeType: "street_address" },
		{ category: PlaceCategory.BUILDING, placeType: "premise" },
		{ category: PlaceCategory.BUILDING, placeType: "subpremise" },
		{ category: PlaceCategory.STREET, placeType: "street_number" },
		{ category: PlaceCategory.NEIGHBORHOOD, placeType: "neighborhood" },
		{ category: PlaceCategory.CITY, placeType: "locality" },
	])("should normalize $placeType as $category", ({ category, placeType }) => {
		expect(PlaceCategory.fromGoogle({ types: [placeType] })).toBe(category);
	});

	it.each([
		{ placeTypes: ["restaurant", "cafe"], expectedCategory: PlaceCategory.RESTAURANT },
		{ placeTypes: ["cafe", "restaurant"], expectedCategory: PlaceCategory.CAFE },
		{ placeTypes: ["store", "pharmacy"], expectedCategory: PlaceCategory.STORE },
		{ placeTypes: ["pharmacy", "store"], expectedCategory: PlaceCategory.PHARMACY },
		{ placeTypes: ["school", "university"], expectedCategory: PlaceCategory.EDUCATION },
		{ placeTypes: ["university", "school"], expectedCategory: PlaceCategory.EDUCATION },
		{ placeTypes: ["train_station", "airport"], expectedCategory: PlaceCategory.TRAIN_STATION },
		{ placeTypes: ["airport", "train_station"], expectedCategory: PlaceCategory.AIRPORT },
		{ placeTypes: ["airport", "heliport"], expectedCategory: PlaceCategory.AIRPORT },
		{ placeTypes: ["heliport", "airport"], expectedCategory: PlaceCategory.HELIPORT },
		{ placeTypes: ["sports_complex", "stadium"], expectedCategory: PlaceCategory.SPORTS_VENUE },
		{ placeTypes: ["stadium", "sports_complex"], expectedCategory: PlaceCategory.STADIUM },
		{
			placeTypes: ["bar", "cocktail_bar"],
			expectedCategory: PlaceCategory.BAR,
		},
		{
			placeTypes: ["cocktail_bar", "bar"],
			expectedCategory: PlaceCategory.COCKTAIL_BAR,
		},
		{
			placeTypes: ["bar", "lounge_bar"],
			expectedCategory: PlaceCategory.BAR,
		},
		{
			placeTypes: ["lounge_bar", "bar"],
			expectedCategory: PlaceCategory.COCKTAIL_BAR,
		},
		{
			placeTypes: ["bar", "wine_bar"],
			expectedCategory: PlaceCategory.BAR,
		},
		{
			placeTypes: ["wine_bar", "bar"],
			expectedCategory: PlaceCategory.WINE_BAR,
		},
		{
			placeTypes: ["bar", "hookah_bar"],
			expectedCategory: PlaceCategory.BAR,
		},
		{
			placeTypes: ["hookah_bar", "bar"],
			expectedCategory: PlaceCategory.HOOKAH_BAR,
		},
		{
			placeTypes: ["bar", "gastropub"],
			expectedCategory: PlaceCategory.BAR,
		},
		{
			placeTypes: ["gastropub", "bar"],
			expectedCategory: PlaceCategory.RESTAURANT,
		},
		{
			placeTypes: ["bar", "bar_and_grill"],
			expectedCategory: PlaceCategory.BAR,
		},
		{
			placeTypes: ["bar_and_grill", "bar"],
			expectedCategory: PlaceCategory.RESTAURANT,
		},
		{ placeTypes: ["restaurant", "bar"], expectedCategory: PlaceCategory.RESTAURANT },
		{ placeTypes: ["bar", "restaurant"], expectedCategory: PlaceCategory.BAR },
		{
			placeTypes: ["car_repair", "car_dealer"],
			expectedCategory: PlaceCategory.VEHICLE_REPAIR,
		},
		{
			placeTypes: ["car_dealer", "car_repair"],
			expectedCategory: PlaceCategory.VEHICLE_DEALER,
		},
		{
			placeTypes: ["car_repair", "car_wash"],
			expectedCategory: PlaceCategory.VEHICLE_REPAIR,
		},
		{
			placeTypes: ["car_wash", "car_repair"],
			expectedCategory: PlaceCategory.VEHICLE_WASH,
		},
		{
			placeTypes: ["car_repair", "tire_shop"],
			expectedCategory: PlaceCategory.VEHICLE_REPAIR,
		},
		{
			placeTypes: ["tire_shop", "car_repair"],
			expectedCategory: PlaceCategory.AUTOMOTIVE_SHOP,
		},
		{
			placeTypes: ["store", "auto_parts_store"],
			expectedCategory: PlaceCategory.STORE,
		},
		{
			placeTypes: ["auto_parts_store", "store"],
			expectedCategory: PlaceCategory.AUTOMOTIVE_SHOP,
		},
		{
			placeTypes: ["store", "bicycle_store"],
			expectedCategory: PlaceCategory.STORE,
		},
		{
			placeTypes: ["bicycle_store", "store"],
			expectedCategory: PlaceCategory.BICYCLE_SHOP,
		},
		{
			placeTypes: ["store", "barber_shop"],
			expectedCategory: PlaceCategory.STORE,
		},
		{
			placeTypes: ["barber_shop", "store"],
			expectedCategory: PlaceCategory.HAIR_CARE,
		},
		{
			placeTypes: ["sports_complex", "race_course"],
			expectedCategory: PlaceCategory.SPORTS_VENUE,
		},
		{
			placeTypes: ["race_course", "sports_complex"],
			expectedCategory: PlaceCategory.RACING_VENUE,
		},
		{
			placeTypes: ["gas_station", "electric_vehicle_charging_station"],
			expectedCategory: PlaceCategory.GAS_STATION,
		},
		{
			placeTypes: ["electric_vehicle_charging_station", "gas_station"],
			expectedCategory: PlaceCategory.CHARGING_STATION,
		},
	])("uses the first mapped Google type for $placeTypes", ({ expectedCategory, placeTypes }) => {
		expect(PlaceCategory.fromGoogle({ types: placeTypes })).toBe(expectedCategory);
	});

	it.each([
		{ placeTypes: ["point_of_interest", "cafe", "restaurant"], expectedCategory: PlaceCategory.CAFE },
		{ placeTypes: ["unsupported_future_type", "restaurant", "cafe"], expectedCategory: PlaceCategory.RESTAURANT },
	])(
		"skips unsupported types before the first mapped Google type for $placeTypes",
		({ placeTypes, expectedCategory }) => {
			expect(PlaceCategory.fromGoogle({ types: placeTypes })).toBe(expectedCategory);
		},
	);

	it.each([
		{ placeTypes: [] as string[] },
		{ placeTypes: ["point_of_interest"] },
		{ placeTypes: ["establishment", "unsupported_future_type"] },
		{ placeTypes: ["transit_station", "transit_stop", "transit_depot"] },
		{ placeTypes: ["taxi_stand"] },
		{ placeTypes: ["beauty_salon"] },
		{ placeTypes: ["beautician"] },
		{ placeTypes: ["brewery"] },
		{ placeTypes: ["winery"] },
	])("should normalize unmapped place types as OTHER", ({ placeTypes }) => {
		expect(PlaceCategory.fromGoogle({ types: placeTypes })).toBe(PlaceCategory.OTHER);
	});
});

it.each([
	[["zoo", "tourist_attraction"], PlaceCategory.ZOO],
	[["tourist_attraction", "zoo"], PlaceCategory.ATTRACTION],
	[["museum", "tourist_attraction"], PlaceCategory.MUSEUM],
	[["tourist_attraction", "museum"], PlaceCategory.ATTRACTION],
	[["tourist_attraction"], PlaceCategory.ATTRACTION],
] as const)("maps Google attractions using the first recognized type for %j", (placeTypes, expected) => {
	expect(PlaceCategory.fromGoogle({ types: placeTypes })).toBe(expected);
});

it("maps every declared Google type and covers every owned category", () => {
	expect(Object.keys(GooglePlaceTypesByCategory)).toEqual(PlaceCategory.values);
	for (const category of PlaceCategory.values) {
		for (const placeType of GooglePlaceTypesByCategory[category]) {
			expect(PlaceCategory.fromGoogle({ types: [placeType] })).toBe(category);
		}
	}
});

it("assigns each Google type to only one category", () => {
	const types = Object.values(GooglePlaceTypesByCategory).flat();
	expect(new Set(types).size).toBe(types.length);
});
