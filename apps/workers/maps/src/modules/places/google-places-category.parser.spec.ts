import { PlaceCategory } from "./place-category.enum";
import { parseGooglePlacesCategory } from "./google-places-category.parser";

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
		{ placeTypes: ["restaurant", "cafe"], expectedCategory: PlaceCategory.CAFE },
		{ placeTypes: ["cafe", "restaurant"], expectedCategory: PlaceCategory.CAFE },
		{ placeTypes: ["store", "pharmacy"], expectedCategory: PlaceCategory.PHARMACY },
		{ placeTypes: ["pharmacy", "store"], expectedCategory: PlaceCategory.PHARMACY },
		{ placeTypes: ["school", "university"], expectedCategory: PlaceCategory.UNIVERSITY },
		{ placeTypes: ["university", "school"], expectedCategory: PlaceCategory.UNIVERSITY },
		{ placeTypes: ["train_station", "airport"], expectedCategory: PlaceCategory.AIRPORT },
		{ placeTypes: ["airport", "train_station"], expectedCategory: PlaceCategory.AIRPORT },
		{ placeTypes: ["airport", "heliport"], expectedCategory: PlaceCategory.HELIPORT },
		{ placeTypes: ["heliport", "airport"], expectedCategory: PlaceCategory.HELIPORT },
		{ placeTypes: ["sports_complex", "stadium"], expectedCategory: PlaceCategory.STADIUM },
		{ placeTypes: ["stadium", "sports_complex"], expectedCategory: PlaceCategory.STADIUM },
		{
			placeTypes: ["bar", "cocktail_bar"],
			expectedCategory: PlaceCategory.COCKTAIL_BAR,
		},
		{
			placeTypes: ["cocktail_bar", "bar"],
			expectedCategory: PlaceCategory.COCKTAIL_BAR,
		},
		{
			placeTypes: ["bar", "lounge_bar"],
			expectedCategory: PlaceCategory.COCKTAIL_BAR,
		},
		{
			placeTypes: ["lounge_bar", "bar"],
			expectedCategory: PlaceCategory.COCKTAIL_BAR,
		},
		{
			placeTypes: ["bar", "wine_bar"],
			expectedCategory: PlaceCategory.WINE_BAR,
		},
		{
			placeTypes: ["wine_bar", "bar"],
			expectedCategory: PlaceCategory.WINE_BAR,
		},
		{
			placeTypes: ["bar", "hookah_bar"],
			expectedCategory: PlaceCategory.HOOKAH_BAR,
		},
		{
			placeTypes: ["hookah_bar", "bar"],
			expectedCategory: PlaceCategory.HOOKAH_BAR,
		},
		{
			placeTypes: ["bar", "gastropub"],
			expectedCategory: PlaceCategory.RESTAURANT,
		},
		{
			placeTypes: ["gastropub", "bar"],
			expectedCategory: PlaceCategory.RESTAURANT,
		},
		{
			placeTypes: ["bar", "bar_and_grill"],
			expectedCategory: PlaceCategory.RESTAURANT,
		},
		{
			placeTypes: ["bar_and_grill", "bar"],
			expectedCategory: PlaceCategory.RESTAURANT,
		},
		{ placeTypes: ["restaurant", "bar"], expectedCategory: PlaceCategory.BAR },
		{ placeTypes: ["bar", "restaurant"], expectedCategory: PlaceCategory.BAR },
		{
			placeTypes: ["car_repair", "car_dealer"],
			expectedCategory: PlaceCategory.VEHICLE_DEALER,
		},
		{
			placeTypes: ["car_dealer", "car_repair"],
			expectedCategory: PlaceCategory.VEHICLE_DEALER,
		},
		{
			placeTypes: ["car_repair", "car_wash"],
			expectedCategory: PlaceCategory.VEHICLE_WASH,
		},
		{
			placeTypes: ["car_wash", "car_repair"],
			expectedCategory: PlaceCategory.VEHICLE_WASH,
		},
		{
			placeTypes: ["car_repair", "tire_shop"],
			expectedCategory: PlaceCategory.AUTOMOTIVE_SHOP,
		},
		{
			placeTypes: ["tire_shop", "car_repair"],
			expectedCategory: PlaceCategory.AUTOMOTIVE_SHOP,
		},
		{
			placeTypes: ["store", "auto_parts_store"],
			expectedCategory: PlaceCategory.AUTOMOTIVE_SHOP,
		},
		{
			placeTypes: ["auto_parts_store", "store"],
			expectedCategory: PlaceCategory.AUTOMOTIVE_SHOP,
		},
		{
			placeTypes: ["store", "bicycle_store"],
			expectedCategory: PlaceCategory.BICYCLE_SHOP,
		},
		{
			placeTypes: ["bicycle_store", "store"],
			expectedCategory: PlaceCategory.BICYCLE_SHOP,
		},
		{
			placeTypes: ["store", "barber_shop"],
			expectedCategory: PlaceCategory.HAIR_CARE,
		},
		{
			placeTypes: ["barber_shop", "store"],
			expectedCategory: PlaceCategory.HAIR_CARE,
		},
		{
			placeTypes: ["sports_complex", "race_course"],
			expectedCategory: PlaceCategory.RACING_VENUE,
		},
		{
			placeTypes: ["race_course", "sports_complex"],
			expectedCategory: PlaceCategory.RACING_VENUE,
		},
		{
			placeTypes: ["gas_station", "electric_vehicle_charging_station"],
			expectedCategory: PlaceCategory.CHARGING_STATION,
		},
		{
			placeTypes: ["electric_vehicle_charging_station", "gas_station"],
			expectedCategory: PlaceCategory.CHARGING_STATION,
		},
	])("should normalize by local precedence for $placeTypes", ({ expectedCategory, placeTypes }) => {
		expect(parseGooglePlacesCategory({ placeTypes: placeTypes })).toBe(expectedCategory);
	});

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
