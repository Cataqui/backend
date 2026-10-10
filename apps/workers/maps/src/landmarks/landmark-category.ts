import { MateoIcon } from "./mateo-icons";

export enum LandmarkCategory {
	AIRPORT = "AIRPORT",
	STATION = "STATION",
	SHOPPING_MALL = "SHOPPING_MALL",
	STADIUM = "STADIUM",
	HOSPITAL = "HOSPITAL",
	UNIVERSITY = "UNIVERSITY",
	ATTRACTION = "ATTRACTION",
	RESTAURANT = "RESTAURANT",
	PARK = "PARK",
	STORE = "STORE",
}

// Colors are the mobile app's AddressCategory colors (Mateo palette step 9), so a pin matches the badge the app
// shows for the same kind of place. Weight orders how likely a place is to be picked before distance is applied.
export const LandmarkCategories: Record<
	LandmarkCategory,
	{ geoapifyCategories: readonly string[]; icon: MateoIcon; color: string; weight: number }
> = {
	[LandmarkCategory.AIRPORT]: {
		geoapifyCategories: ["airport"],
		icon: MateoIcon.PLANE_UP_RIGHT,
		color: "#2B7FFF",
		weight: 300,
	},
	[LandmarkCategory.STATION]: {
		geoapifyCategories: ["public_transport.subway", "public_transport.train"],
		icon: MateoIcon.TRAIN_FRONT,
		color: "#2B7FFF",
		weight: 120,
	},
	[LandmarkCategory.SHOPPING_MALL]: {
		geoapifyCategories: ["commercial.shopping_mall"],
		icon: MateoIcon.SHOPPING_BAG,
		color: "#2B7FFF",
		weight: 90,
	},
	[LandmarkCategory.STADIUM]: {
		geoapifyCategories: ["sport.stadium"],
		icon: MateoIcon.STADIUM,
		color: "#8E51FF",
		weight: 75,
	},
	[LandmarkCategory.HOSPITAL]: {
		geoapifyCategories: ["healthcare.hospital"],
		icon: MateoIcon.MEDICAL_CROSS,
		color: "#FB2C36",
		weight: 70,
	},
	[LandmarkCategory.UNIVERSITY]: {
		geoapifyCategories: ["education.university"],
		icon: MateoIcon.GRADUATE_CAP,
		color: "#2B7FFF",
		weight: 65,
	},
	[LandmarkCategory.ATTRACTION]: {
		geoapifyCategories: ["tourism.attraction", "tourism.sights", "entertainment.museum", "entertainment.zoo"],
		icon: MateoIcon.CLASSIC_BUILDING,
		color: "#8E51FF",
		weight: 60,
	},
	[LandmarkCategory.RESTAURANT]: {
		geoapifyCategories: ["catering.restaurant", "catering.fast_food"],
		icon: MateoIcon.FORK_KNIFE,
		color: "#FF6900",
		weight: 58,
	},
	[LandmarkCategory.PARK]: { geoapifyCategories: ["leisure.park"], icon: MateoIcon.TREE, color: "#00C950", weight: 50 },
	[LandmarkCategory.STORE]: {
		geoapifyCategories: ["commercial.supermarket", "commercial.department_store"],
		icon: MateoIcon.SHOPPING_CART,
		color: "#2B7FFF",
		weight: 30,
	},
};

// Places are requested per group so that a busy area full of shops never pushes airports or stations out of a
// provider page. Limits bound provider cost; Geoapify charges one credit per 20 returned places.
export const LandmarkQueryGroups: readonly { categories: readonly LandmarkCategory[]; limit: number }[] = [
	{ categories: [LandmarkCategory.AIRPORT, LandmarkCategory.STATION], limit: 60 },
	{
		categories: [
			LandmarkCategory.SHOPPING_MALL,
			LandmarkCategory.STADIUM,
			LandmarkCategory.HOSPITAL,
			LandmarkCategory.UNIVERSITY,
			LandmarkCategory.ATTRACTION,
		],
		limit: 100,
	},
	{ categories: [LandmarkCategory.PARK], limit: 100 },
	{ categories: [LandmarkCategory.STORE], limit: 60 },
	{ categories: [LandmarkCategory.RESTAURANT], limit: 300 },
];

export function findLandmarkCategory(geoapifyCategories: readonly string[]): LandmarkCategory | undefined {
	return Object.values(LandmarkCategory).find((category) =>
		LandmarkCategories[category].geoapifyCategories.some((owned) =>
			geoapifyCategories.some((candidate) => candidate === owned || candidate.startsWith(`${owned}.`)),
		),
	);
}
