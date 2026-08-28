import { AddressCategory } from "./address-category.enum";
import { parseGooglePlacesAddressCategory } from "./google-places-address-category.parser";

describe("parseGooglePlacesAddressCategory", () => {
	it.each(["race_course", "go_karting_venue"])(
		"should normalize %s as the provider-neutral racing venue category",
		(placeType) => {
			expect(parseGooglePlacesAddressCategory({ placeTypes: [placeType] })).toBe(AddressCategory.RACING_VENUE);
		},
	);

	it.each([
		{ category: AddressCategory.NIGHT_CLUB, placeType: "night_club" },
		{ category: AddressCategory.CAFE, placeType: "cafe" },
		{ category: AddressCategory.BAR, placeType: "cocktail_bar" },
		{ category: AddressCategory.RESTAURANT, placeType: "restaurant" },
		{ category: AddressCategory.AMUSEMENT_PARK, placeType: "amusement_park" },
		{ category: AddressCategory.PARK, placeType: "city_park" },
		{ category: AddressCategory.SHOPPING_MALL, placeType: "shopping_mall" },
		{ category: AddressCategory.SUPERMARKET, placeType: "grocery_store" },
		{ category: AddressCategory.PHARMACY, placeType: "pharmacy" },
		{ category: AddressCategory.STORE, placeType: "store" },
		{ category: AddressCategory.UNIVERSITY, placeType: "university" },
		{ category: AddressCategory.SCHOOL, placeType: "primary_school" },
		{ category: AddressCategory.LIBRARY, placeType: "library" },
		{ category: AddressCategory.HOSPITAL, placeType: "hospital" },
		{ category: AddressCategory.GYM, placeType: "gym" },
		{ category: AddressCategory.STADIUM, placeType: "stadium" },
		{ category: AddressCategory.RACING_VENUE, placeType: "race_course" },
		{ category: AddressCategory.SPORTS_VENUE, placeType: "sports_complex" },
		{ category: AddressCategory.MUSEUM, placeType: "museum" },
		{ category: AddressCategory.MOVIE_THEATER, placeType: "movie_theater" },
		{ category: AddressCategory.THEATER, placeType: "performing_arts_theater" },
		{ category: AddressCategory.HELIPORT, placeType: "heliport" },
		{ category: AddressCategory.AIRPORT, placeType: "airport" },
		{ category: AddressCategory.BUS_STATION, placeType: "bus_station" },
		{ category: AddressCategory.TRAIN_STATION, placeType: "subway_station" },
		{ category: AddressCategory.PARKING, placeType: "parking_lot" },
		{ category: AddressCategory.CHARGING_STATION, placeType: "electric_vehicle_charging_station" },
		{ category: AddressCategory.GAS_STATION, placeType: "gas_station" },
		{ category: AddressCategory.BANK, placeType: "bank" },
		{ category: AddressCategory.POLICE_STATION, placeType: "police" },
		{ category: AddressCategory.FIRE_STATION, placeType: "fire_station" },
		{ category: AddressCategory.PLACE_OF_WORSHIP, placeType: "place_of_worship" },
		{ category: AddressCategory.GOVERNMENT_OFFICE, placeType: "government_office" },
		{ category: AddressCategory.HOTEL, placeType: "hotel" },
		{ category: AddressCategory.STREET, placeType: "route" },
		{ category: AddressCategory.STREET, placeType: "street_address" },
		{ category: AddressCategory.STREET, placeType: "premise" },
		{ category: AddressCategory.STREET, placeType: "subpremise" },
		{ category: AddressCategory.STREET, placeType: "street_number" },
		{ category: AddressCategory.NEIGHBORHOOD, placeType: "neighborhood" },
		{ category: AddressCategory.CITY, placeType: "locality" },
	])("should normalize $placeType as $category", ({ category, placeType }) => {
		expect(parseGooglePlacesAddressCategory({ placeTypes: [placeType] })).toBe(category);
	});

	it.each([
		{ placeTypes: ["restaurant", "cafe"], expectedCategory: AddressCategory.CAFE },
		{ placeTypes: ["cafe", "restaurant"], expectedCategory: AddressCategory.CAFE },
		{ placeTypes: ["store", "pharmacy"], expectedCategory: AddressCategory.PHARMACY },
		{ placeTypes: ["pharmacy", "store"], expectedCategory: AddressCategory.PHARMACY },
		{ placeTypes: ["school", "university"], expectedCategory: AddressCategory.UNIVERSITY },
		{ placeTypes: ["university", "school"], expectedCategory: AddressCategory.UNIVERSITY },
		{ placeTypes: ["train_station", "airport"], expectedCategory: AddressCategory.AIRPORT },
		{ placeTypes: ["airport", "train_station"], expectedCategory: AddressCategory.AIRPORT },
		{ placeTypes: ["airport", "heliport"], expectedCategory: AddressCategory.HELIPORT },
		{ placeTypes: ["heliport", "airport"], expectedCategory: AddressCategory.HELIPORT },
		{ placeTypes: ["sports_complex", "stadium"], expectedCategory: AddressCategory.STADIUM },
		{ placeTypes: ["stadium", "sports_complex"], expectedCategory: AddressCategory.STADIUM },
		{
			placeTypes: ["sports_complex", "race_course"],
			expectedCategory: AddressCategory.RACING_VENUE,
		},
		{
			placeTypes: ["race_course", "sports_complex"],
			expectedCategory: AddressCategory.RACING_VENUE,
		},
		{
			placeTypes: ["gas_station", "electric_vehicle_charging_station"],
			expectedCategory: AddressCategory.CHARGING_STATION,
		},
		{
			placeTypes: ["electric_vehicle_charging_station", "gas_station"],
			expectedCategory: AddressCategory.CHARGING_STATION,
		},
	])("should normalize by local precedence for $placeTypes", ({ expectedCategory, placeTypes }) => {
		expect(parseGooglePlacesAddressCategory({ placeTypes: placeTypes })).toBe(expectedCategory);
	});

	it.each([
		{ placeTypes: [] as string[] },
		{ placeTypes: ["point_of_interest"] },
		{ placeTypes: ["establishment", "unsupported_future_type"] },
		{ placeTypes: ["transit_station", "transit_stop", "transit_depot"] },
		{ placeTypes: ["ferry_terminal", "taxi_stand"] },
	])("should normalize unmapped place types as OTHER", ({ placeTypes }) => {
		expect(parseGooglePlacesAddressCategory({ placeTypes: placeTypes })).toBe(AddressCategory.OTHER);
	});
});
