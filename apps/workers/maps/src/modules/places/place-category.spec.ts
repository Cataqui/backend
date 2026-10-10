import {
	getGeoapifyPlaceCategories,
	parseGeoapifyPlaceCategory,
	parseGooglePlacesCategory,
	PlaceCategory,
} from "./place-category";

describe("parseGooglePlacesCategory", () => {
	it.each([
		{ category: PlaceCategory.VEHICLE_REPAIR, placeType: "car_repair" },
		{ category: PlaceCategory.AUTOMOTIVE_SHOP, placeType: "tire_shop" },
		{ category: PlaceCategory.AUTOMOTIVE_SHOP, placeType: "auto_parts_store" },
		{ category: PlaceCategory.VEHICLE_WASH, placeType: "car_wash" },
		{ category: PlaceCategory.VEHICLE_DEALER, placeType: "car_dealer" },
		{ category: PlaceCategory.VEHICLE_DEALER, placeType: "truck_dealer" },
		{ category: PlaceCategory.BICYCLE_SHOP, placeType: "bicycle_store" },
	])("should normalize $placeType as $category", ({ category, placeType }) => {
		expect(parseGooglePlacesCategory({ placeTypes: [placeType] })).toBe(category);
	});

	it.each(["barber_shop", "hair_salon", "hair_care"])(
		"should normalize %s as the provider-neutral hair care category",
		(placeType) => {
			expect(parseGooglePlacesCategory({ placeTypes: [placeType] })).toBe(PlaceCategory.HAIR_CARE);
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
		expect(parseGooglePlacesCategory({ placeTypes: [placeType] })).toBe(category);
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
		expect(parseGooglePlacesCategory({ placeTypes: [placeType] })).toBe(PlaceCategory.LODGING);
	});

	it.each(["race_course", "go_karting_venue"])(
		"should normalize %s as the provider-neutral racing venue category",
		(placeType) => {
			expect(parseGooglePlacesCategory({ placeTypes: [placeType] })).toBe(PlaceCategory.RACING_VENUE);
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
		{ category: PlaceCategory.UNIVERSITY, placeType: "university" },
		{ category: PlaceCategory.SCHOOL, placeType: "primary_school" },
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
		{ category: PlaceCategory.STREET, placeType: "premise" },
		{ category: PlaceCategory.STREET, placeType: "subpremise" },
		{ category: PlaceCategory.STREET, placeType: "street_number" },
		{ category: PlaceCategory.NEIGHBORHOOD, placeType: "neighborhood" },
		{ category: PlaceCategory.CITY, placeType: "locality" },
	])("should normalize $placeType as $category", ({ category, placeType }) => {
		expect(parseGooglePlacesCategory({ placeTypes: [placeType] })).toBe(category);
	});

	it.each([
		{ placeTypes: ["restaurant", "cafe"], expectedCategory: PlaceCategory.RESTAURANT },
		{ placeTypes: ["cafe", "restaurant"], expectedCategory: PlaceCategory.CAFE },
		{ placeTypes: ["store", "pharmacy"], expectedCategory: PlaceCategory.STORE },
		{ placeTypes: ["pharmacy", "store"], expectedCategory: PlaceCategory.PHARMACY },
		{ placeTypes: ["school", "university"], expectedCategory: PlaceCategory.SCHOOL },
		{ placeTypes: ["university", "school"], expectedCategory: PlaceCategory.UNIVERSITY },
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
		expect(parseGooglePlacesCategory({ placeTypes: placeTypes })).toBe(expectedCategory);
	});

	it.each([
		{ placeTypes: ["point_of_interest", "cafe", "restaurant"], expectedCategory: PlaceCategory.CAFE },
		{ placeTypes: ["unsupported_future_type", "restaurant", "cafe"], expectedCategory: PlaceCategory.RESTAURANT },
	])(
		"skips unsupported types before the first mapped Google type for $placeTypes",
		({ placeTypes, expectedCategory }) => {
			expect(parseGooglePlacesCategory({ placeTypes: placeTypes })).toBe(expectedCategory);
		},
	);

	it.each([
		{ placeTypes: [] as string[] },
		{ placeTypes: ["point_of_interest"] },
		{ placeTypes: ["establishment", "unsupported_future_type"] },
		{ placeTypes: ["transit_station", "transit_stop", "transit_depot"] },
		{ placeTypes: ["ferry_terminal", "taxi_stand"] },
		{ placeTypes: ["beauty_salon"] },
		{ placeTypes: ["beautician"] },
		{ placeTypes: ["brewery"] },
		{ placeTypes: ["winery"] },
	])("should normalize unmapped place types as OTHER", ({ placeTypes }) => {
		expect(parseGooglePlacesCategory({ placeTypes: placeTypes })).toBe(PlaceCategory.OTHER);
	});
});

it.each([
	[["zoo", "tourist_attraction"], PlaceCategory.ZOO],
	[["tourist_attraction", "zoo"], PlaceCategory.ZOO],
	[["museum", "tourist_attraction"], PlaceCategory.MUSEUM],
	[["tourist_attraction", "museum"], PlaceCategory.MUSEUM],
	[["tourist_attraction"], PlaceCategory.OTHER],
] as const)("maps Google zoo types while preserving existing attraction fallbacks for %j", (placeTypes, expected) => {
	expect(parseGooglePlacesCategory({ placeTypes: placeTypes })).toBe(expected);
});

describe("parseGeoapifyPlaceCategory", () => {
	it("classifies Monumento às Bandeiras as an attraction despite its broad sport category", () => {
		const categories = [
			"building",
			"building.historic",
			"building.tourism",
			"sport",
			"tourism",
			"tourism.attraction",
			"tourism.sights",
			"tourism.sights.memorial",
			"tourism.sights.memorial.monument",
		];
		expect(parseGeoapifyPlaceCategory({ categories: categories })).toBe(PlaceCategory.ATTRACTION);
		expect(parseGeoapifyPlaceCategory({ categories: [...categories].reverse() })).toBe(PlaceCategory.ATTRACTION);
	});

	it("prefers the specific supermarket mapping over a generic store mapping regardless of order", () => {
		const categories = ["commercial.clothing.women", "commercial.supermarket"];
		expect(parseGeoapifyPlaceCategory({ categories: categories })).toBe(PlaceCategory.SUPERMARKET);
		expect(parseGeoapifyPlaceCategory({ categories: [...categories].reverse() })).toBe(PlaceCategory.SUPERMARKET);
	});

	it.each([
		[["airport", "airport.international"], PlaceCategory.AIRPORT],
		[["public_transport", "public_transport.subway"], PlaceCategory.TRAIN_STATION],
		[["public_transport.train"], PlaceCategory.TRAIN_STATION],
		[["commercial", "commercial.shopping_mall"], PlaceCategory.SHOPPING_MALL],
		[["sport.stadium"], PlaceCategory.STADIUM],
		[["healthcare.hospital"], PlaceCategory.HOSPITAL],
		[["education.university"], PlaceCategory.UNIVERSITY],
		[["tourism.attraction"], PlaceCategory.ATTRACTION],
		[["tourism.sights.castle"], PlaceCategory.ATTRACTION],
		[["entertainment.museum"], PlaceCategory.MUSEUM],
		[["entertainment.zoo"], PlaceCategory.ZOO],
		[["religion.place_of_worship"], PlaceCategory.PLACE_OF_WORSHIP],
		[["religion.place_of_worship.christianity"], PlaceCategory.PLACE_OF_WORSHIP],
		[["religion.place_of_worship.islam"], PlaceCategory.PLACE_OF_WORSHIP],
		[["tourism.sights.place_of_worship"], PlaceCategory.PLACE_OF_WORSHIP],
		[["tourism.sights.place_of_worship.cathedral"], PlaceCategory.PLACE_OF_WORSHIP],
		[["catering", "catering.fast_food", "catering.fast_food.burger"], PlaceCategory.RESTAURANT],
		[["catering.restaurant"], PlaceCategory.RESTAURANT],
		[["leisure", "leisure.park"], PlaceCategory.PARK],
		[["commercial.supermarket"], PlaceCategory.SUPERMARKET],
		[["commercial.department_store"], PlaceCategory.STORE],
	] as const)("normalizes Geoapify categories %j as %s", (categories, expected) => {
		expect(parseGeoapifyPlaceCategory({ categories: categories })).toBe(expected);
	});

	it.each([
		["highway.residential", PlaceCategory.STREET],
		["administrative.neighbourhood_level", PlaceCategory.NEIGHBORHOOD],
		["administrative.city_level", PlaceCategory.CITY],
		["catering.cafe.coffee_shop", PlaceCategory.CAFE],
		["catering.bar", PlaceCategory.BAR],
		["catering.pub", PlaceCategory.BAR],
		["catering.biergarten", PlaceCategory.BAR],
		["catering.taproom", PlaceCategory.BAR],
		["adult.nightclub", PlaceCategory.NIGHT_CLUB],
		["entertainment.theme_park", PlaceCategory.AMUSEMENT_PARK],
		["entertainment.water_park", PlaceCategory.AMUSEMENT_PARK],
		["commercial.clothing", PlaceCategory.STORE],
		["commercial.convenience", PlaceCategory.STORE],
		["service.beauty.hairdresser", PlaceCategory.HAIR_CARE],
		["commercial.outdoor_and_sport.bicycle", PlaceCategory.BICYCLE_SHOP],
		["commercial.vehicle", PlaceCategory.VEHICLE_DEALER],
		["service.vehicle.repair.car", PlaceCategory.VEHICLE_REPAIR],
		["service.vehicle.car_wash", PlaceCategory.VEHICLE_WASH],
		["accommodation.hotel", PlaceCategory.LODGING],
		["camping.camp_site", PlaceCategory.LODGING],
		["camping.caravan_site", PlaceCategory.LODGING],
		["education.school", PlaceCategory.SCHOOL],
		["childcare.kindergarten", PlaceCategory.SCHOOL],
		["education.library", PlaceCategory.LIBRARY],
		["healthcare.pharmacy", PlaceCategory.PHARMACY],
		["commercial.health_and_beauty.pharmacy", PlaceCategory.PHARMACY],
		["commercial.chemist", PlaceCategory.PHARMACY],
		["sport.fitness.fitness_centre", PlaceCategory.GYM],
		["sport.fitness.gym", PlaceCategory.GYM],
		["sport.sports_centre", PlaceCategory.SPORTS_VENUE],
		["activity.sport_club", PlaceCategory.SPORTS_VENUE],
		["entertainment.culture.theatre", PlaceCategory.THEATER],
		["entertainment.cinema", PlaceCategory.MOVIE_THEATER],
		["public_transport.bus", PlaceCategory.BUS_STATION],
		["parking.cars.underground", PlaceCategory.PARKING],
		["service.vehicle.charging_station", PlaceCategory.CHARGING_STATION],
		["service.vehicle.fuel", PlaceCategory.GAS_STATION],
		["service.financial.bank", PlaceCategory.BANK],
		["service.police", PlaceCategory.POLICE_STATION],
		["service.fire_station", PlaceCategory.FIRE_STATION],
		["office.government.administrative", PlaceCategory.GOVERNMENT_OFFICE],
	] as const)("normalizes the documented Geoapify category %s as %s", (category, expected) => {
		expect(parseGeoapifyPlaceCategory({ categories: [category] })).toBe(expected);
	});

	it.each([
		[["commercial", "commercial.supermarket"], PlaceCategory.SUPERMARKET],
		[["commercial.supermarket_extra"], PlaceCategory.STORE],
		[["commercial", "commercial.health_and_beauty.pharmacy"], PlaceCategory.PHARMACY],
		[["commercial", "commercial.outdoor_and_sport.bicycle"], PlaceCategory.BICYCLE_SHOP],
		[["commercial", "commercial.vehicle"], PlaceCategory.VEHICLE_DEALER],
		[["sport", "sport.fitness.gym"], PlaceCategory.GYM],
		[["sport", "sport.stadium"], PlaceCategory.STADIUM],
	] as const)("keeps specific categories ahead of broad provider parents in %j", (categories, expected) => {
		expect(parseGeoapifyPlaceCategory({ categories: categories })).toBe(expected);
		expect(parseGeoapifyPlaceCategory({ categories: [...categories].reverse() })).toBe(expected);
	});
	it.each(
		[
			[],
			["service", "service.financial.bureau_de_change"],
			["airport_shuttle"],
			["commercial_extra.supermarket"],
			["religion.place_of_worship_extra"],
			["unsupported_future_category"],
		].map((categories) => ({ categories: categories })),
	)("returns OTHER for unmapped categories $categories", ({ categories }) => {
		expect(parseGeoapifyPlaceCategory({ categories: categories })).toBe(PlaceCategory.OTHER);
	});
	it.each([
		[["tourism.attraction", "entertainment.museum"], PlaceCategory.ATTRACTION],
		[["entertainment.museum", "tourism.attraction"], PlaceCategory.MUSEUM],
		[["tourism.sights", "entertainment.zoo"], PlaceCategory.ATTRACTION],
		[["entertainment.zoo", "tourism.sights"], PlaceCategory.ZOO],
		[["tourism.sights", "tourism.sights.place_of_worship.cathedral"], PlaceCategory.PLACE_OF_WORSHIP],
		[["tourism.sights.place_of_worship.cathedral", "tourism.sights"], PlaceCategory.PLACE_OF_WORSHIP],
		[["tourism.attraction", "religion.place_of_worship.christianity"], PlaceCategory.ATTRACTION],
		[["religion.place_of_worship.christianity", "tourism.attraction"], PlaceCategory.PLACE_OF_WORSHIP],
	] as const)(
		"uses provider order for equally specific mappings and prefers specific descendants in %j",
		(categories, expected) => {
			expect(parseGeoapifyPlaceCategory({ categories: categories })).toBe(expected);
		},
	);
	it.each([
		[["commercial.clothing", "commercial.supermarket"], PlaceCategory.SUPERMARKET],
		[["commercial.supermarket", "commercial.clothing"], PlaceCategory.SUPERMARKET],
		[["sport.sports_centre", "sport.stadium"], PlaceCategory.STADIUM],
		[["sport.stadium", "sport.sports_centre"], PlaceCategory.STADIUM],
		[["unsupported_future_category", "catering.cafe", "catering.restaurant"], PlaceCategory.CAFE],
		[["commercial", "commercial.supermarket", "catering.cafe"], PlaceCategory.SUPERMARKET],
		[["commercial", "catering.cafe", "commercial.supermarket"], PlaceCategory.CAFE],
	] as const)(
		"prefers deeper mappings and uses provider order for equal hierarchy depth in %j",
		(categories, expected) => {
			expect(parseGeoapifyPlaceCategory({ categories: categories })).toBe(expected);
		},
	);
});

describe("getGeoapifyPlaceCategories", () => {
	it("keeps the requested category order and all provider aliases", () => {
		expect(
			getGeoapifyPlaceCategories({
				categories: [PlaceCategory.RESTAURANT, PlaceCategory.TRAIN_STATION, PlaceCategory.PLACE_OF_WORSHIP],
			}),
		).toEqual([
			"catering.restaurant",
			"catering.fast_food",
			"public_transport.subway",
			"public_transport.train",
			"religion.place_of_worship",
			"tourism.sights.place_of_worship",
		]);
	});

	it("omits categories without a provider mapping", () => {
		expect(getGeoapifyPlaceCategories({ categories: [PlaceCategory.OTHER, PlaceCategory.PARK] })).toEqual([
			"leisure.park",
		]);
		expect(getGeoapifyPlaceCategories({ categories: [] })).toEqual([]);
	});
});
