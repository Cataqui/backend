import { MateoDefaultPalette } from "@mateo/palette";
import { MateoMonkeyHeadIconData } from "@mateo/icons/monkey-head";
import type { MateoSvgIcon } from "@mateo/icons";
import { MateoForkKnifeIconData } from "@mateo/icons/fork-knife";
import { MateoShoppingBagIconData } from "@mateo/icons/shopping-bag";
import { MateoShoppingCartIconData } from "@mateo/icons/shopping-cart";
import { MateoTreeIconData } from "@mateo/icons/tree";
import { MateoGraduateCapIconData } from "@mateo/icons/graduate-cap";
import { MateoTrainFrontIconData } from "@mateo/icons/train-front";
import { MateoPlaneUpRightIconData } from "@mateo/icons/plane-up-right";
import { MateoStadiumIconData } from "@mateo/icons/stadium";
import { MateoClassicBuildingIconData } from "@mateo/icons/classic-building";
import { MateoPrayingFigureIconData } from "@mateo/icons/praying-figure";
import { MateoMedicalCrossIconData } from "@mateo/icons/medical-cross";
import { PlaceCategory } from "../../places/place-category";

export const LandmarkCategoryConfig: Partial<
	Record<PlaceCategory, { icon: MateoSvgIcon; color: string; priority: number }>
> = {
	[PlaceCategory.AIRPORT]: {
		icon: MateoPlaneUpRightIconData,
		color: MateoDefaultPalette.blue[9],
		priority: 300,
	},
	[PlaceCategory.TRAIN_STATION]: {
		icon: MateoTrainFrontIconData,
		color: MateoDefaultPalette.blue[9],
		priority: 120,
	},
	[PlaceCategory.SHOPPING_MALL]: {
		icon: MateoShoppingBagIconData,
		color: MateoDefaultPalette.blue[9],
		priority: 90,
	},
	[PlaceCategory.STADIUM]: {
		icon: MateoStadiumIconData,
		color: MateoDefaultPalette.violet[9],
		priority: 75,
	},
	[PlaceCategory.HOSPITAL]: {
		icon: MateoMedicalCrossIconData,
		color: MateoDefaultPalette.red[9],
		priority: 70,
	},
	[PlaceCategory.UNIVERSITY]: {
		icon: MateoGraduateCapIconData,
		color: MateoDefaultPalette.blue[9],
		priority: 65,
	},
	[PlaceCategory.ATTRACTION]: {
		icon: MateoClassicBuildingIconData,
		color: MateoDefaultPalette.violet[9],
		priority: 60,
	},
	[PlaceCategory.MUSEUM]: { icon: MateoClassicBuildingIconData, color: MateoDefaultPalette.violet[9], priority: 60 },
	[PlaceCategory.ZOO]: { icon: MateoMonkeyHeadIconData, color: MateoDefaultPalette.green[11], priority: 60 },
	[PlaceCategory.PLACE_OF_WORSHIP]: {
		icon: MateoPrayingFigureIconData,
		color: MateoDefaultPalette.violet[9],
		priority: 60,
	},
	[PlaceCategory.SUPERMARKET]: { icon: MateoShoppingCartIconData, color: MateoDefaultPalette.blue[9], priority: 30 },
	[PlaceCategory.RESTAURANT]: {
		icon: MateoForkKnifeIconData,
		color: MateoDefaultPalette.orange[9],
		priority: 58,
	},
	[PlaceCategory.PARK]: { icon: MateoTreeIconData, color: MateoDefaultPalette.green[9], priority: 50 },
	[PlaceCategory.STORE]: {
		icon: MateoShoppingCartIconData,
		color: MateoDefaultPalette.blue[9],
		priority: 30,
	},
};
