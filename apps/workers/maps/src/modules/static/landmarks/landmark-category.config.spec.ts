import { MateoMonkeyHeadIconData } from "@mateo/icons/monkey-head";
import { PlaceCategory } from "../../places/place-category";
import { LandmarkCategoryConfig } from "./landmark-category.config";
import { MateoPrayingFigureIconData } from "@mateo/icons/praying-figure";

it("uses the mobile praying figure and violet badge for places of worship", () => {
	expect(LandmarkCategoryConfig[PlaceCategory.PLACE_OF_WORSHIP]).toMatchObject({
		icon: MateoPrayingFigureIconData,
		color: "#8E51FF",
	});
});

it("keeps the existing landmark styles for supermarkets, stores, museums and attractions", () => {
	expect(LandmarkCategoryConfig[PlaceCategory.SUPERMARKET]).toEqual(LandmarkCategoryConfig[PlaceCategory.STORE]);
	expect(LandmarkCategoryConfig[PlaceCategory.MUSEUM]).toEqual(LandmarkCategoryConfig[PlaceCategory.ATTRACTION]);
});

it("uses the mobile app's Mateo palette colors", () => {
	expect(new Set(Object.values(LandmarkCategoryConfig).map((category) => category.color))).toEqual(
		new Set(["#2B7FFF", "#8E51FF", "#FB2C36", "#FF6900", "#00C950", "#006F29"]),
	);
});

it("uses the Mateo monkey head and green step 11 for zoos", () => {
	expect(LandmarkCategoryConfig[PlaceCategory.ZOO]).toMatchObject({
		icon: MateoMonkeyHeadIconData,
		color: "#006F29",
	});
});
