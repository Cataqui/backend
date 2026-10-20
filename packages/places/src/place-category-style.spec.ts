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
import { PlaceCategoryStyle } from "./place-category-style";

it("defines a visual identity for every owned category", () => {
	expect(Object.keys(PlaceCategoryStyle).sort()).toEqual([...PlaceCategory.values].sort());
});

// Flutter address_category.dart is the reference; ATTRACTION retains its existing identity.
it.each([
	[PlaceCategory.COMMUNITY_CENTER, MateoMapPinIconData, "neutral", 10, 12],
	[PlaceCategory.PEDESTRIAN_AREA, MateoMapPinIconData, "neutral", 10, 12],
	[PlaceCategory.FERRY_TERMINAL, MateoMapPinIconData, "neutral", 10, 12],
	[PlaceCategory.CLINIC, MateoMedicalCrossIconData, "red", 9, 11],
	[PlaceCategory.BUILDING, MateoBuildingsIconData, "neutral", 10, 12],
	[PlaceCategory.BRIDGE, MateoMapPinIconData, "neutral", 10, 12],
	[PlaceCategory.STREET, MateoMapPinIconData, "neutral", 10, 12],
	[PlaceCategory.NEIGHBORHOOD, MateoMapPinIconData, "neutral", 10, 12],
	[PlaceCategory.CITY, MateoMapPinIconData, "neutral", 10, 12],
	[PlaceCategory.OTHER, MateoMapPinIconData, "neutral", 10, 12],
	[PlaceCategory.AUTOMOTIVE_SHOP, MateoTireIconData, "blue", 11, 12],
	[PlaceCategory.RESTAURANT, MateoForkKnifeIconData, "orange", 9, 11],
	[PlaceCategory.CAFE, MateoHotCoffeeCupIconData, "orange", 9, 11],
	[PlaceCategory.GAS_STATION, MateoGasStationIconData, "orange", 9, 11],
	[PlaceCategory.SUPERMARKET, MateoShoppingCartIconData, "blue", 9, 11],
	[PlaceCategory.VEHICLE_DEALER, MateoShoppingBagIconData, "blue", 9, 11],
	[PlaceCategory.SHOPPING_MALL, MateoShoppingBagIconData, "blue", 9, 11],
	[PlaceCategory.STORE, MateoShoppingBagIconData, "blue", 9, 11],
	[PlaceCategory.BAR, MateoBeerMugIconData, "amber", 9, 11],
	[PlaceCategory.COCKTAIL_BAR, MateoMatiniGlassIconData, "pink", 9, 11],
	[PlaceCategory.WINE_BAR, MateoWineGlassIconData, "red", 9, 11],
	[PlaceCategory.HOOKAH_BAR, MateoHookahIconData, "violet", 9, 11],
	[PlaceCategory.HAIR_CARE, MateoScissorsIconData, "amber", 9, 11],
	[PlaceCategory.NIGHT_CLUB, MateoDiscoBallIconData, "green", 9, 11],
	[PlaceCategory.AMUSEMENT_PARK, MateoFerrisWheelIconData, "green", 9, 11],
	[PlaceCategory.THEATER, MateoSadMaskHappyMaskIconData, "green", 9, 11],
	[PlaceCategory.MOVIE_THEATER, MateoPopcornIconData, "green", 9, 11],
	[PlaceCategory.PARK, MateoTreeIconData, "green", 9, 11],
	[PlaceCategory.BICYCLE_SHOP, MateoBicycleIconData, "green", 9, 11],
	[PlaceCategory.CHARGING_STATION, MateoEvPlugIconData, "green", 9, 11],
	[PlaceCategory.ZOO, MateoMonkeyHeadIconData, "green", 11, 12],
	[PlaceCategory.BANK, MateoBankBuildingIconData, "red", 11, 12],
	[PlaceCategory.LODGING, MateoSleepingFigureIconData, "teal", 9, 11],
	[PlaceCategory.VEHICLE_REPAIR, MateoWrenchIconData, "neutral", 12, 12],
	[PlaceCategory.GOVERNMENT_OFFICE, MateoGovernmentBuildingIconData, "blue", 11, 12],
	[PlaceCategory.VEHICLE_WASH, MateoDropFoamIconData, "cyan", 10, 12],
	[PlaceCategory.EDUCATION, MateoGraduateCapIconData, "blue", 9, 11],
	[PlaceCategory.LIBRARY, MateoBookIconData, "blue", 9, 11],
	[PlaceCategory.BUS_STATION, MateoBusFrontIconData, "blue", 9, 11],
	[PlaceCategory.TRAIN_STATION, MateoTrainFrontIconData, "blue", 9, 11],
	[PlaceCategory.AIRPORT, MateoPlaneUpRightIconData, "blue", 9, 11],
	[PlaceCategory.HELIPORT, MateoHelicopterFrontIconData, "blue", 9, 11],
	[PlaceCategory.PARKING, MateoParkingSignIconData, "blue", 9, 11],
	[PlaceCategory.POLICE_STATION, MateoPoliceBadgeIconData, "blue", 9, 11],
	[PlaceCategory.GYM, MateoDumbbellIconData, "violet", 9, 11],
	[PlaceCategory.STADIUM, MateoStadiumIconData, "violet", 9, 11],
	[PlaceCategory.RACING_VENUE, MateoCheckeredFlagIconData, "violet", 9, 11],
	[PlaceCategory.SPORTS_VENUE, MateoRunningFigureIconData, "violet", 9, 11],
	[PlaceCategory.MUSEUM, MateoClassicBuildingIconData, "violet", 9, 11],
	[PlaceCategory.PLACE_OF_WORSHIP, MateoPrayingFigureIconData, "violet", 9, 11],
	[PlaceCategory.HOSPITAL, MateoMedicalCrossIconData, "red", 9, 11],
	[PlaceCategory.PHARMACY, MateoPillsIconData, "red", 9, 11],
	[PlaceCategory.FIRE_STATION, MateoFlameIconData, "red", 9, 11],
	[PlaceCategory.ATTRACTION, MateoClassicBuildingIconData, "violet", 9, 11],
] as const)("matches the reference icon and palette steps for %s", (category, icon, family, step, textStep) => {
	expect(PlaceCategoryStyle[category]).toEqual({
		icon: icon,
		color: MateoDefaultPalette[family][step],
		textColor: MateoDefaultPalette[family][textStep],
	});
});
