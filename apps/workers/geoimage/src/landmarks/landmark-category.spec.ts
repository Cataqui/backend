import { findLandmarkCategory, LandmarkCategories, LandmarkCategory, LandmarkQueryGroups } from "./landmark-category";

describe("findLandmarkCategory", () => {
	it.each([
		[["airport", "airport.international"], LandmarkCategory.AIRPORT],
		[["public_transport", "public_transport.subway"], LandmarkCategory.STATION],
		[["commercial", "commercial.shopping_mall"], LandmarkCategory.SHOPPING_MALL],
		[["catering", "catering.fast_food", "catering.fast_food.burger"], LandmarkCategory.RESTAURANT],
		[["leisure", "leisure.park"], LandmarkCategory.PARK],
	] as const)("maps Geoapify categories %j to %s", (categories, expected) => {
		expect(findLandmarkCategory(categories)).toBe(expected);
	});

	it("ignores categories that are not landmarks", () => {
		expect(findLandmarkCategory(["service", "service.financial.bank"])).toBeUndefined();
	});

	it("does not match a category by a shared name prefix", () => {
		expect(findLandmarkCategory(["airport_shuttle"])).toBeUndefined();
	});
});

describe("LandmarkQueryGroups", () => {
	it("requests every landmark category exactly once", () => {
		expect(LandmarkQueryGroups.flatMap((group) => group.categories).sort()).toEqual(
			Object.values(LandmarkCategory).sort(),
		);
	});

	it("uses the mobile app's Mateo palette colors", () => {
		expect(new Set(Object.values(LandmarkCategories).map((category) => category.color))).toEqual(
			new Set(["#2B7FFF", "#8E51FF", "#FB2C36", "#FF6900", "#00C950"]),
		);
	});
});
