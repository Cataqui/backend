import { describe, it, expect } from "vitest";
import { LocationConstants } from "./location.constants";

describe("LocationConstants", () => {
	it("should define EARTH_RADIUS_METERS as 6,371,000", () => {
		expect(LocationConstants.EARTH_RADIUS_METERS).toBe(6_371_000);
	});

	it("should define FULL_CIRCLE_RADIANS as Math.PI * 2", () => {
		expect(LocationConstants.FULL_CIRCLE_RADIANS).toBe(Math.PI * 2);
	});
});
