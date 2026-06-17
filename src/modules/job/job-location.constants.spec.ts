import { JobLocationConstants } from "./job-location.constants";

describe("JobLocationConstants", () => {
	it("should set the minimum fuzzy distance to 300 meters", () => {
		expect(JobLocationConstants.FUZZ_MIN_DISTANCE_METERS).toBe(300);
	});

	it("should set the maximum fuzzy distance to 500 meters", () => {
		expect(JobLocationConstants.FUZZ_MAX_DISTANCE_METERS).toBe(500);
	});

	it("should keep the maximum fuzzy distance greater than the minimum fuzzy distance", () => {
		expect(JobLocationConstants.FUZZ_MAX_DISTANCE_METERS).toBeGreaterThan(
			JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
		);
	});

	it("should set the public area radius to 2000 meters", () => {
		expect(JobLocationConstants.AREA_RADIUS_METERS).toBe(2000);
	});
});
