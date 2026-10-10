import { PlaceCategory } from "./place-category.enum";

// Earlier entries win so specific place types take precedence over broader categories.
const _categoryMappings: ReadonlyArray<{
	category: PlaceCategory;
	placeTypes: readonly string[];
}> = [
	{ category: PlaceCategory.NIGHT_CLUB, placeTypes: ["night_club"] },
	{ category: PlaceCategory.CAFE, placeTypes: ["cafe", "cafeteria"] },
	{ category: PlaceCategory.COCKTAIL_BAR, placeTypes: ["cocktail_bar", "lounge_bar"] },
	{ category: PlaceCategory.WINE_BAR, placeTypes: ["wine_bar"] },
	{ category: PlaceCategory.HOOKAH_BAR, placeTypes: ["hookah_bar"] },
	{ category: PlaceCategory.RESTAURANT, placeTypes: ["gastropub", "bar_and_grill"] },
	{
		category: PlaceCategory.BAR,
		placeTypes: ["bar", "pub", "irish_pub", "sports_bar", "beer_garden", "brewpub"],
	},
	{ category: PlaceCategory.RESTAURANT, placeTypes: ["restaurant"] },
	{ category: PlaceCategory.AMUSEMENT_PARK, placeTypes: ["amusement_park", "water_park"] },
	{
		category: PlaceCategory.PARK,
		placeTypes: ["park", "city_park", "cycling_park", "dog_park", "skateboard_park"],
	},
	{ category: PlaceCategory.SHOPPING_MALL, placeTypes: ["shopping_mall"] },
	{
		category: PlaceCategory.SUPERMARKET,
		placeTypes: ["supermarket", "grocery_store", "discount_supermarket"],
	},
	{ category: PlaceCategory.PHARMACY, placeTypes: ["pharmacy", "drugstore"] },
	{ category: PlaceCategory.VEHICLE_DEALER, placeTypes: ["car_dealer", "truck_dealer"] },
	{ category: PlaceCategory.VEHICLE_WASH, placeTypes: ["car_wash"] },
	{ category: PlaceCategory.AUTOMOTIVE_SHOP, placeTypes: ["auto_parts_store", "tire_shop"] },
	{ category: PlaceCategory.BICYCLE_SHOP, placeTypes: ["bicycle_store"] },
	{ category: PlaceCategory.VEHICLE_REPAIR, placeTypes: ["car_repair"] },
	{ category: PlaceCategory.HAIR_CARE, placeTypes: ["barber_shop", "hair_salon", "hair_care"] },
	{ category: PlaceCategory.STORE, placeTypes: ["store", "convenience_store", "department_store"] },
	{ category: PlaceCategory.UNIVERSITY, placeTypes: ["university"] },
	{
		category: PlaceCategory.SCHOOL,
		placeTypes: ["school", "preschool", "primary_school", "secondary_school"],
	},
	{ category: PlaceCategory.LIBRARY, placeTypes: ["library"] },
	{ category: PlaceCategory.HOSPITAL, placeTypes: ["hospital", "general_hospital"] },
	{ category: PlaceCategory.GYM, placeTypes: ["gym"] },
	{ category: PlaceCategory.STADIUM, placeTypes: ["stadium"] },
	{
		category: PlaceCategory.RACING_VENUE,
		placeTypes: ["race_course", "go_karting_venue"],
	},
	{
		category: PlaceCategory.SPORTS_VENUE,
		placeTypes: ["sports_activity_location", "sports_club", "sports_complex"],
	},
	{ category: PlaceCategory.MUSEUM, placeTypes: ["museum", "art_museum", "history_museum"] },
	{ category: PlaceCategory.MOVIE_THEATER, placeTypes: ["movie_theater"] },
	{
		category: PlaceCategory.THEATER,
		placeTypes: ["performing_arts_theater", "amphitheatre", "auditorium", "comedy_club", "concert_hall"],
	},
	{ category: PlaceCategory.HELIPORT, placeTypes: ["heliport"] },
	{ category: PlaceCategory.AIRPORT, placeTypes: ["airport", "international_airport"] },
	{ category: PlaceCategory.BUS_STATION, placeTypes: ["bus_station", "bus_stop"] },
	{
		category: PlaceCategory.TRAIN_STATION,
		placeTypes: ["light_rail_station", "subway_station", "train_station", "tram_stop"],
	},
	{ category: PlaceCategory.PARKING, placeTypes: ["parking", "parking_garage", "parking_lot", "park_and_ride"] },
	{
		category: PlaceCategory.CHARGING_STATION,
		placeTypes: ["ebike_charging_station", "electric_vehicle_charging_station"],
	},
	{ category: PlaceCategory.GAS_STATION, placeTypes: ["gas_station"] },
	{ category: PlaceCategory.BANK, placeTypes: ["bank"] },
	{ category: PlaceCategory.POLICE_STATION, placeTypes: ["police", "neighborhood_police_station"] },
	{ category: PlaceCategory.FIRE_STATION, placeTypes: ["fire_station"] },
	{
		category: PlaceCategory.PLACE_OF_WORSHIP,
		placeTypes: ["place_of_worship", "buddhist_temple", "church", "hindu_temple", "mosque", "synagogue"],
	},
	{
		category: PlaceCategory.GOVERNMENT_OFFICE,
		placeTypes: ["government_office", "local_government_office"],
	},
	{
		category: PlaceCategory.LODGING,
		placeTypes: [
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
		],
	},
	{
		category: PlaceCategory.STREET,
		placeTypes: ["route", "street_address", "premise", "subpremise", "street_number"],
	},
	{ category: PlaceCategory.NEIGHBORHOOD, placeTypes: ["neighborhood", "sublocality"] },
	{ category: PlaceCategory.CITY, placeTypes: ["locality"] },
];

export function parseGooglePlacesCategory(params: { placeTypes: readonly string[] }): PlaceCategory {
	const placeTypes = new Set(params.placeTypes);

	for (const mapping of _categoryMappings) {
		if (mapping.placeTypes.some((placeType) => placeTypes.has(placeType))) return mapping.category;
	}

	return PlaceCategory.OTHER;
}
