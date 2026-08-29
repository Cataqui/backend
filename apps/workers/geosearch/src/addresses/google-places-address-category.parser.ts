import { AddressCategory } from "./address-category.enum";

const _categoryMappings: ReadonlyArray<{
	category: AddressCategory;
	placeTypes: readonly string[];
}> = [
	{ category: AddressCategory.NIGHT_CLUB, placeTypes: ["night_club"] },
	{ category: AddressCategory.CAFE, placeTypes: ["cafe", "cafeteria"] },
	{ category: AddressCategory.COCKTAIL_BAR, placeTypes: ["cocktail_bar", "lounge_bar"] },
	{ category: AddressCategory.WINE_BAR, placeTypes: ["wine_bar"] },
	{ category: AddressCategory.HOOKAH_BAR, placeTypes: ["hookah_bar"] },
	{ category: AddressCategory.RESTAURANT, placeTypes: ["gastropub", "bar_and_grill"] },
	{
		category: AddressCategory.BAR,
		placeTypes: ["bar", "pub", "irish_pub", "sports_bar", "beer_garden", "brewpub"],
	},
	{ category: AddressCategory.RESTAURANT, placeTypes: ["restaurant"] },
	{ category: AddressCategory.AMUSEMENT_PARK, placeTypes: ["amusement_park", "water_park"] },
	{
		category: AddressCategory.PARK,
		placeTypes: ["park", "city_park", "cycling_park", "dog_park", "skateboard_park"],
	},
	{ category: AddressCategory.SHOPPING_MALL, placeTypes: ["shopping_mall"] },
	{
		category: AddressCategory.SUPERMARKET,
		placeTypes: ["supermarket", "grocery_store", "discount_supermarket"],
	},
	{ category: AddressCategory.PHARMACY, placeTypes: ["pharmacy", "drugstore"] },
	{ category: AddressCategory.VEHICLE_DEALER, placeTypes: ["car_dealer", "truck_dealer"] },
	{ category: AddressCategory.VEHICLE_WASH, placeTypes: ["car_wash"] },
	{ category: AddressCategory.AUTOMOTIVE_SHOP, placeTypes: ["auto_parts_store", "tire_shop"] },
	{ category: AddressCategory.BICYCLE_SHOP, placeTypes: ["bicycle_store"] },
	{ category: AddressCategory.VEHICLE_REPAIR, placeTypes: ["car_repair"] },
	{ category: AddressCategory.HAIR_CARE, placeTypes: ["barber_shop", "hair_salon", "hair_care"] },
	{ category: AddressCategory.STORE, placeTypes: ["store", "convenience_store", "department_store"] },
	{ category: AddressCategory.UNIVERSITY, placeTypes: ["university"] },
	{
		category: AddressCategory.SCHOOL,
		placeTypes: ["school", "preschool", "primary_school", "secondary_school"],
	},
	{ category: AddressCategory.LIBRARY, placeTypes: ["library"] },
	{ category: AddressCategory.HOSPITAL, placeTypes: ["hospital", "general_hospital"] },
	{ category: AddressCategory.GYM, placeTypes: ["gym"] },
	{ category: AddressCategory.STADIUM, placeTypes: ["stadium"] },
	{
		category: AddressCategory.RACING_VENUE,
		placeTypes: ["race_course", "go_karting_venue"],
	},
	{
		category: AddressCategory.SPORTS_VENUE,
		placeTypes: ["sports_activity_location", "sports_club", "sports_complex"],
	},
	{ category: AddressCategory.MUSEUM, placeTypes: ["museum", "art_museum", "history_museum"] },
	{ category: AddressCategory.MOVIE_THEATER, placeTypes: ["movie_theater"] },
	{
		category: AddressCategory.THEATER,
		placeTypes: ["performing_arts_theater", "amphitheatre", "auditorium", "comedy_club", "concert_hall"],
	},
	{ category: AddressCategory.HELIPORT, placeTypes: ["heliport"] },
	{ category: AddressCategory.AIRPORT, placeTypes: ["airport", "international_airport"] },
	{ category: AddressCategory.BUS_STATION, placeTypes: ["bus_station", "bus_stop"] },
	{
		category: AddressCategory.TRAIN_STATION,
		placeTypes: ["light_rail_station", "subway_station", "train_station", "tram_stop"],
	},
	{ category: AddressCategory.PARKING, placeTypes: ["parking", "parking_garage", "parking_lot", "park_and_ride"] },
	{
		category: AddressCategory.CHARGING_STATION,
		placeTypes: ["ebike_charging_station", "electric_vehicle_charging_station"],
	},
	{ category: AddressCategory.GAS_STATION, placeTypes: ["gas_station"] },
	{ category: AddressCategory.BANK, placeTypes: ["bank"] },
	{ category: AddressCategory.POLICE_STATION, placeTypes: ["police", "neighborhood_police_station"] },
	{ category: AddressCategory.FIRE_STATION, placeTypes: ["fire_station"] },
	{
		category: AddressCategory.PLACE_OF_WORSHIP,
		placeTypes: ["place_of_worship", "buddhist_temple", "church", "hindu_temple", "mosque", "synagogue"],
	},
	{
		category: AddressCategory.GOVERNMENT_OFFICE,
		placeTypes: ["government_office", "local_government_office"],
	},
	{
		category: AddressCategory.LODGING,
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
		category: AddressCategory.STREET,
		placeTypes: ["route", "street_address", "premise", "subpremise", "street_number"],
	},
	{ category: AddressCategory.NEIGHBORHOOD, placeTypes: ["neighborhood", "sublocality"] },
	{ category: AddressCategory.CITY, placeTypes: ["locality"] },
];

export function parseGooglePlacesAddressCategory(params: { placeTypes: readonly string[] }): AddressCategory {
	const placeTypes = new Set(params.placeTypes);

	for (const mapping of _categoryMappings) {
		if (mapping.placeTypes.some((placeType) => placeTypes.has(placeType))) return mapping.category;
	}

	return AddressCategory.OTHER;
}
