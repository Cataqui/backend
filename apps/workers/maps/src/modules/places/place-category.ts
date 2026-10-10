// Provider category keys come from https://apidocs.geoapify.com/docs/places/#categories.
// Table order does not determine the selected category; each parser follows provider values.
export const PlaceCategories = {
	AIRPORT: {
		googlePlacesCategories: ["airport", "international_airport"],
		geoapifyPlacesCategories: ["airport"],
	},
	TRAIN_STATION: {
		googlePlacesCategories: ["light_rail_station", "subway_station", "train_station", "tram_stop"],
		geoapifyPlacesCategories: ["public_transport.subway", "public_transport.train"],
	},
	SHOPPING_MALL: {
		googlePlacesCategories: ["shopping_mall"],
		geoapifyPlacesCategories: ["commercial.shopping_mall"],
	},
	STADIUM: {
		googlePlacesCategories: ["stadium"],
		geoapifyPlacesCategories: ["sport.stadium"],
	},
	HOSPITAL: {
		googlePlacesCategories: ["hospital", "general_hospital"],
		geoapifyPlacesCategories: ["healthcare.hospital"],
	},
	UNIVERSITY: {
		googlePlacesCategories: ["university"],
		geoapifyPlacesCategories: ["education.university"],
	},
	MUSEUM: {
		googlePlacesCategories: ["museum", "art_museum", "history_museum"],
		geoapifyPlacesCategories: ["entertainment.museum"],
	},
	ZOO: {
		googlePlacesCategories: ["zoo"],
		geoapifyPlacesCategories: ["entertainment.zoo"],
	},
	PLACE_OF_WORSHIP: {
		googlePlacesCategories: ["place_of_worship", "buddhist_temple", "church", "hindu_temple", "mosque", "synagogue"],
		geoapifyPlacesCategories: ["religion.place_of_worship", "tourism.sights.place_of_worship"],
	},
	STREET: {
		googlePlacesCategories: ["route", "street_address", "premise", "subpremise", "street_number"],
		geoapifyPlacesCategories: ["highway"],
	},
	NEIGHBORHOOD: {
		googlePlacesCategories: ["neighborhood", "sublocality"],
		geoapifyPlacesCategories: ["administrative.neighbourhood_level"],
	},
	CITY: {
		googlePlacesCategories: ["locality"],
		geoapifyPlacesCategories: ["administrative.city_level"],
	},
	CAFE: {
		googlePlacesCategories: ["cafe", "cafeteria"],
		geoapifyPlacesCategories: ["catering.cafe"],
	},
	BAR: {
		googlePlacesCategories: ["bar", "pub", "irish_pub", "sports_bar", "beer_garden", "brewpub"],
		geoapifyPlacesCategories: ["catering.bar", "catering.pub", "catering.biergarten", "catering.taproom"],
	},
	COCKTAIL_BAR: {
		googlePlacesCategories: ["cocktail_bar", "lounge_bar"],
		// Geoapify Places has no documented category specific to this kind of place.
		geoapifyPlacesCategories: [],
	},
	WINE_BAR: {
		googlePlacesCategories: ["wine_bar"],
		// Geoapify Places has no documented category specific to this kind of place.
		geoapifyPlacesCategories: [],
	},
	HOOKAH_BAR: {
		googlePlacesCategories: ["hookah_bar"],
		// Geoapify Places has no documented category specific to this kind of place.
		geoapifyPlacesCategories: [],
	},
	NIGHT_CLUB: {
		googlePlacesCategories: ["night_club"],
		geoapifyPlacesCategories: ["adult.nightclub"],
	},
	AMUSEMENT_PARK: {
		googlePlacesCategories: ["amusement_park", "water_park"],
		geoapifyPlacesCategories: ["entertainment.theme_park", "entertainment.water_park"],
	},
	HAIR_CARE: {
		googlePlacesCategories: ["barber_shop", "hair_salon", "hair_care"],
		geoapifyPlacesCategories: ["service.beauty.hairdresser"],
	},
	AUTOMOTIVE_SHOP: {
		googlePlacesCategories: ["auto_parts_store", "tire_shop"],
		// Geoapify Places has no documented category specific to this kind of place.
		geoapifyPlacesCategories: [],
	},
	BICYCLE_SHOP: {
		googlePlacesCategories: ["bicycle_store"],
		geoapifyPlacesCategories: ["commercial.outdoor_and_sport.bicycle"],
	},
	VEHICLE_DEALER: {
		googlePlacesCategories: ["car_dealer", "truck_dealer"],
		geoapifyPlacesCategories: ["commercial.vehicle"],
	},
	VEHICLE_REPAIR: {
		googlePlacesCategories: ["car_repair"],
		geoapifyPlacesCategories: ["service.vehicle.repair.car"],
	},
	VEHICLE_WASH: {
		googlePlacesCategories: ["car_wash"],
		geoapifyPlacesCategories: ["service.vehicle.car_wash"],
	},
	LODGING: {
		googlePlacesCategories: [
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
		geoapifyPlacesCategories: ["accommodation", "camping.camp_site", "camping.caravan_site"],
	},
	SCHOOL: {
		googlePlacesCategories: ["school", "preschool", "primary_school", "secondary_school"],
		geoapifyPlacesCategories: ["education.school", "childcare.kindergarten"],
	},
	LIBRARY: {
		googlePlacesCategories: ["library"],
		geoapifyPlacesCategories: ["education.library"],
	},
	PHARMACY: {
		googlePlacesCategories: ["pharmacy", "drugstore"],
		geoapifyPlacesCategories: ["healthcare.pharmacy", "commercial.health_and_beauty.pharmacy", "commercial.chemist"],
	},
	GYM: {
		googlePlacesCategories: ["gym"],
		geoapifyPlacesCategories: ["sport.fitness.fitness_centre", "sport.fitness.gym"],
	},
	RACING_VENUE: {
		googlePlacesCategories: ["race_course", "go_karting_venue"],
		// Geoapify Places has no documented category specific to this kind of place.
		geoapifyPlacesCategories: [],
	},
	THEATER: {
		googlePlacesCategories: ["performing_arts_theater", "amphitheatre", "auditorium", "comedy_club", "concert_hall"],
		geoapifyPlacesCategories: ["entertainment.culture.theatre"],
	},
	MOVIE_THEATER: {
		googlePlacesCategories: ["movie_theater"],
		geoapifyPlacesCategories: ["entertainment.cinema"],
	},
	BUS_STATION: {
		googlePlacesCategories: ["bus_station", "bus_stop"],
		geoapifyPlacesCategories: ["public_transport.bus"],
	},
	HELIPORT: {
		googlePlacesCategories: ["heliport"],
		// Geoapify Places has no documented category specific to this kind of place.
		geoapifyPlacesCategories: [],
	},
	PARKING: {
		googlePlacesCategories: ["parking", "parking_garage", "parking_lot", "park_and_ride"],
		geoapifyPlacesCategories: ["parking"],
	},
	CHARGING_STATION: {
		googlePlacesCategories: ["ebike_charging_station", "electric_vehicle_charging_station"],
		geoapifyPlacesCategories: ["service.vehicle.charging_station"],
	},
	GAS_STATION: {
		googlePlacesCategories: ["gas_station"],
		geoapifyPlacesCategories: ["service.vehicle.fuel"],
	},
	BANK: {
		googlePlacesCategories: ["bank"],
		geoapifyPlacesCategories: ["service.financial.bank"],
	},
	POLICE_STATION: {
		googlePlacesCategories: ["police", "neighborhood_police_station"],
		geoapifyPlacesCategories: ["service.police"],
	},
	FIRE_STATION: {
		googlePlacesCategories: ["fire_station"],
		geoapifyPlacesCategories: ["service.fire_station"],
	},
	GOVERNMENT_OFFICE: {
		googlePlacesCategories: ["government_office", "local_government_office"],
		geoapifyPlacesCategories: ["office.government"],
	},
	SPORTS_VENUE: {
		googlePlacesCategories: ["sports_activity_location", "sports_club", "sports_complex"],
		geoapifyPlacesCategories: ["sport", "activity.sport_club"],
	},
	ATTRACTION: {
		googlePlacesCategories: [],
		geoapifyPlacesCategories: ["tourism.attraction", "tourism.sights"],
	},
	RESTAURANT: {
		googlePlacesCategories: ["gastropub", "bar_and_grill", "restaurant"],
		geoapifyPlacesCategories: ["catering.restaurant", "catering.fast_food"],
	},
	PARK: {
		googlePlacesCategories: ["park", "city_park", "cycling_park", "dog_park", "skateboard_park"],
		geoapifyPlacesCategories: ["leisure.park"],
	},
	SUPERMARKET: {
		googlePlacesCategories: ["supermarket", "grocery_store", "discount_supermarket"],
		geoapifyPlacesCategories: ["commercial.supermarket"],
	},
	STORE: {
		googlePlacesCategories: ["store", "convenience_store", "department_store"],
		geoapifyPlacesCategories: ["commercial"],
	},
	OTHER: {
		googlePlacesCategories: [],
		geoapifyPlacesCategories: [],
	},
} as const satisfies Record<
	string,
	{
		googlePlacesCategories: readonly string[];
		geoapifyPlacesCategories: readonly string[];
	}
>;

export type PlaceCategory = keyof typeof PlaceCategories;

// The keys above also provide the runtime category values used by schemas and consumers.
export const PlaceCategory = Object.fromEntries(
	Object.keys(PlaceCategories).map((category) => [category, category]),
) as { readonly [Category in PlaceCategory]: Category };

export function parseGooglePlacesCategory(params: { placeTypes: readonly string[] }): PlaceCategory {
	for (const placeType of params.placeTypes) {
		for (const category of Object.values(PlaceCategory)) {
			const categories: readonly string[] = PlaceCategories[category].googlePlacesCategories;
			if (categories.includes(placeType)) return category;
		}
	}

	return PlaceCategory.OTHER;
}

export function parseGeoapifyPlaceCategory(params: { categories: readonly string[] }): PlaceCategory {
	let category: PlaceCategory = PlaceCategory.OTHER;
	let matchedDepth = 0;

	// Compare mapped hierarchy depth across the whole array; provider order only breaks ties.
	for (const providerCategory of params.categories) {
		for (const candidate of Object.values(PlaceCategory)) {
			for (const prefix of PlaceCategories[candidate].geoapifyPlacesCategories) {
				if (providerCategory !== prefix && !providerCategory.startsWith(`${prefix}.`)) continue;

				const depth = prefix.split(".").length;
				if (depth <= matchedDepth) continue;

				category = candidate;
				matchedDepth = depth;
			}
		}
	}

	return category;
}

export function getGeoapifyPlaceCategories(params: { categories: readonly PlaceCategory[] }): string[] {
	return params.categories.flatMap((category) => [...PlaceCategories[category].geoapifyPlacesCategories]);
}
