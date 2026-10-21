import type { MateoSvgIcon } from "@mateo/icons";
import { MateoBankBuildingIconData } from "@mateo/icons/bank-building";
import { MateoBeerMugIconData } from "@mateo/icons/beer-mug";
import { MateoBicycleIconData } from "@mateo/icons/bicycle";
import { MateoBookIconData } from "@mateo/icons/book";
import { MateoBuildingsIconData } from "@mateo/icons/buildings";
import { MateoBusFrontIconData } from "@mateo/icons/bus-front";
import { MateoCheckeredFlagIconData } from "@mateo/icons/checkered-flag";
import { MateoClassicBuildingIconData } from "@mateo/icons/classic-building";
import { MateoDiscoBallIconData } from "@mateo/icons/disco-ball";
import { MateoDropFoamIconData } from "@mateo/icons/drop-foam";
import { MateoDumbbellIconData } from "@mateo/icons/dumbbell";
import { MateoEvPlugIconData } from "@mateo/icons/ev-plug";
import { MateoFerrisWheelIconData } from "@mateo/icons/ferris-wheel";
import { MateoFlameIconData } from "@mateo/icons/flame";
import { MateoForkKnifeIconData } from "@mateo/icons/fork-knife";
import { MateoGasStationIconData } from "@mateo/icons/gas-station";
import { MateoGovernmentBuildingIconData } from "@mateo/icons/government-building";
import { MateoGraduateCapIconData } from "@mateo/icons/graduate-cap";
import { MateoHelicopterFrontIconData } from "@mateo/icons/helicopter-front";
import { MateoHookahIconData } from "@mateo/icons/hookah";
import { MateoHotCoffeeCupIconData } from "@mateo/icons/hot-coffee-cup";
import { MateoMapPinIconData } from "@mateo/icons/location-pin";
import { MateoMatiniGlassIconData } from "@mateo/icons/matini-glass";
import { MateoMedicalCrossIconData } from "@mateo/icons/medical-cross";
import { MateoMonkeyHeadIconData } from "@mateo/icons/monkey-head";
import { MateoParkingSignIconData } from "@mateo/icons/parking-sign";
import { MateoPillsIconData } from "@mateo/icons/pills";
import { MateoPlaneUpRightIconData } from "@mateo/icons/plane-up-right";
import { MateoPoliceBadgeIconData } from "@mateo/icons/police-badge";
import { MateoPopcornIconData } from "@mateo/icons/popcorn";
import { MateoPrayingFigureIconData } from "@mateo/icons/praying-figure";
import { MateoRunningFigureIconData } from "@mateo/icons/running-figure";
import { MateoSadMaskHappyMaskIconData } from "@mateo/icons/sad-mask-happy-mask";
import { MateoScissorsIconData } from "@mateo/icons/scissors";
import { MateoShoppingBagIconData } from "@mateo/icons/shopping-bag";
import { MateoShoppingCartIconData } from "@mateo/icons/shopping-cart";
import { MateoSleepingFigureIconData } from "@mateo/icons/sleeping-figure";
import { MateoStadiumIconData } from "@mateo/icons/stadium";
import { MateoTireIconData } from "@mateo/icons/tire";
import { MateoTrainFrontIconData } from "@mateo/icons/train-front";
import { MateoTreeIconData } from "@mateo/icons/tree";
import { MateoWineGlassIconData } from "@mateo/icons/wine-glass";
import { MateoWrenchIconData } from "@mateo/icons/wrench";
import { MateoDefaultPalette } from "@mateo/palette";
import { PlaceCategory } from "./place-category";

export const PlaceCategoryStyle = {
	[PlaceCategory.COMMUNITY_CENTER]: {
		icon: MateoMapPinIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.PEDESTRIAN_AREA]: {
		icon: MateoMapPinIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.FERRY_TERMINAL]: {
		icon: MateoMapPinIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.CLINIC]: {
		icon: MateoMedicalCrossIconData,
		color: MateoDefaultPalette.red[9],
		textColor: MateoDefaultPalette.red[11],
	},
	[PlaceCategory.BUILDING]: {
		icon: MateoBuildingsIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.BRIDGE]: {
		icon: MateoMapPinIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.STREET]: {
		icon: MateoMapPinIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.NEIGHBORHOOD]: {
		icon: MateoMapPinIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.CITY]: {
		icon: MateoMapPinIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.OTHER]: {
		icon: MateoMapPinIconData,
		color: MateoDefaultPalette.neutral[10],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.AUTOMOTIVE_SHOP]: {
		icon: MateoTireIconData,
		color: MateoDefaultPalette.blue[11],
		textColor: MateoDefaultPalette.blue[12],
	},
	[PlaceCategory.RESTAURANT]: {
		icon: MateoForkKnifeIconData,
		color: MateoDefaultPalette.orange[9],
		textColor: MateoDefaultPalette.orange[11],
	},
	[PlaceCategory.CAFE]: {
		icon: MateoHotCoffeeCupIconData,
		color: MateoDefaultPalette.orange[9],
		textColor: MateoDefaultPalette.orange[11],
	},
	[PlaceCategory.GAS_STATION]: {
		icon: MateoGasStationIconData,
		color: MateoDefaultPalette.orange[9],
		textColor: MateoDefaultPalette.orange[11],
	},
	[PlaceCategory.SUPERMARKET]: {
		icon: MateoShoppingCartIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.VEHICLE_DEALER]: {
		icon: MateoShoppingBagIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.SHOPPING_MALL]: {
		icon: MateoShoppingBagIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.STORE]: {
		icon: MateoShoppingBagIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.BAR]: {
		icon: MateoBeerMugIconData,
		color: MateoDefaultPalette.amber[9],
		textColor: MateoDefaultPalette.amber[11],
	},
	[PlaceCategory.COCKTAIL_BAR]: {
		icon: MateoMatiniGlassIconData,
		color: MateoDefaultPalette.pink[9],
		textColor: MateoDefaultPalette.pink[11],
	},
	[PlaceCategory.WINE_BAR]: {
		icon: MateoWineGlassIconData,
		color: MateoDefaultPalette.red[9],
		textColor: MateoDefaultPalette.red[11],
	},
	[PlaceCategory.HOOKAH_BAR]: {
		icon: MateoHookahIconData,
		color: MateoDefaultPalette.violet[9],
		textColor: MateoDefaultPalette.violet[11],
	},
	[PlaceCategory.HAIR_CARE]: {
		icon: MateoScissorsIconData,
		color: MateoDefaultPalette.amber[9],
		textColor: MateoDefaultPalette.amber[11],
	},
	[PlaceCategory.NIGHT_CLUB]: {
		icon: MateoDiscoBallIconData,
		color: MateoDefaultPalette.green[9],
		textColor: MateoDefaultPalette.green[11],
	},
	[PlaceCategory.AMUSEMENT_PARK]: {
		icon: MateoFerrisWheelIconData,
		color: MateoDefaultPalette.green[9],
		textColor: MateoDefaultPalette.green[11],
	},
	[PlaceCategory.THEATER]: {
		icon: MateoSadMaskHappyMaskIconData,
		color: MateoDefaultPalette.green[9],
		textColor: MateoDefaultPalette.green[11],
	},
	[PlaceCategory.MOVIE_THEATER]: {
		icon: MateoPopcornIconData,
		color: MateoDefaultPalette.green[9],
		textColor: MateoDefaultPalette.green[11],
	},
	[PlaceCategory.PARK]: {
		icon: MateoTreeIconData,
		color: MateoDefaultPalette.green[9],
		textColor: MateoDefaultPalette.green[11],
	},
	[PlaceCategory.BICYCLE_SHOP]: {
		icon: MateoBicycleIconData,
		color: MateoDefaultPalette.green[9],
		textColor: MateoDefaultPalette.green[11],
	},
	[PlaceCategory.CHARGING_STATION]: {
		icon: MateoEvPlugIconData,
		color: MateoDefaultPalette.green[9],
		textColor: MateoDefaultPalette.green[11],
	},
	[PlaceCategory.ZOO]: {
		icon: MateoMonkeyHeadIconData,
		color: MateoDefaultPalette.green[11],
		textColor: MateoDefaultPalette.green[12],
	},
	[PlaceCategory.BANK]: {
		icon: MateoBankBuildingIconData,
		color: MateoDefaultPalette.red[11],
		textColor: MateoDefaultPalette.red[12],
	},
	[PlaceCategory.LODGING]: {
		icon: MateoSleepingFigureIconData,
		color: MateoDefaultPalette.teal[9],
		textColor: MateoDefaultPalette.teal[11],
	},
	[PlaceCategory.VEHICLE_REPAIR]: {
		icon: MateoWrenchIconData,
		color: MateoDefaultPalette.neutral[12],
		textColor: MateoDefaultPalette.neutral[12],
	},
	[PlaceCategory.GOVERNMENT_OFFICE]: {
		icon: MateoGovernmentBuildingIconData,
		color: MateoDefaultPalette.blue[11],
		textColor: MateoDefaultPalette.blue[12],
	},
	[PlaceCategory.VEHICLE_WASH]: {
		icon: MateoDropFoamIconData,
		color: MateoDefaultPalette.cyan[10],
		textColor: MateoDefaultPalette.cyan[12],
	},
	[PlaceCategory.EDUCATION]: {
		icon: MateoGraduateCapIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.LIBRARY]: {
		icon: MateoBookIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.BUS_STATION]: {
		icon: MateoBusFrontIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.TRAIN_STATION]: {
		icon: MateoTrainFrontIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.AIRPORT]: {
		icon: MateoPlaneUpRightIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.HELIPORT]: {
		icon: MateoHelicopterFrontIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.PARKING]: {
		icon: MateoParkingSignIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.POLICE_STATION]: {
		icon: MateoPoliceBadgeIconData,
		color: MateoDefaultPalette.blue[9],
		textColor: MateoDefaultPalette.blue[11],
	},
	[PlaceCategory.GYM]: {
		icon: MateoDumbbellIconData,
		color: MateoDefaultPalette.violet[9],
		textColor: MateoDefaultPalette.violet[11],
	},
	[PlaceCategory.STADIUM]: {
		icon: MateoStadiumIconData,
		color: MateoDefaultPalette.violet[9],
		textColor: MateoDefaultPalette.violet[11],
	},
	[PlaceCategory.RACING_VENUE]: {
		icon: MateoCheckeredFlagIconData,
		color: MateoDefaultPalette.violet[9],
		textColor: MateoDefaultPalette.violet[11],
	},
	[PlaceCategory.SPORTS_VENUE]: {
		icon: MateoRunningFigureIconData,
		color: MateoDefaultPalette.violet[9],
		textColor: MateoDefaultPalette.violet[11],
	},
	[PlaceCategory.MUSEUM]: {
		icon: MateoClassicBuildingIconData,
		color: MateoDefaultPalette.violet[9],
		textColor: MateoDefaultPalette.violet[11],
	},
	[PlaceCategory.PLACE_OF_WORSHIP]: {
		icon: MateoPrayingFigureIconData,
		color: MateoDefaultPalette.violet[9],
		textColor: MateoDefaultPalette.violet[11],
	},
	[PlaceCategory.HOSPITAL]: {
		icon: MateoMedicalCrossIconData,
		color: MateoDefaultPalette.red[9],
		textColor: MateoDefaultPalette.red[11],
	},
	[PlaceCategory.PHARMACY]: {
		icon: MateoPillsIconData,
		color: MateoDefaultPalette.red[9],
		textColor: MateoDefaultPalette.red[11],
	},
	[PlaceCategory.FIRE_STATION]: {
		icon: MateoFlameIconData,
		color: MateoDefaultPalette.red[9],
		textColor: MateoDefaultPalette.red[11],
	},
	[PlaceCategory.ATTRACTION]: {
		icon: MateoClassicBuildingIconData,
		color: MateoDefaultPalette.violet[9],
		textColor: MateoDefaultPalette.violet[11],
	},
} satisfies Record<PlaceCategory, { icon: MateoSvgIcon; color: string; textColor: string }>;
