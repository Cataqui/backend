import fc from "fast-check";
import { LocationUtils } from "./location.utils";

describe("LocationUtils", () => {
	describe("fuzzLocationCoordinate", () => {
		it("should never return the same coordinate as the input coordinate", () => {
			fc.assert(
				fc.property(
					fc.record({
						latitude: fc.double({ min: -90, max: 90, noDefaultInfinity: true, noNaN: true }),
						longitude: fc.double({ min: -180, max: 180, noDefaultInfinity: true, noNaN: true }),
						minDistanceMeters: fc.double({ min: 1, max: 5_000, noDefaultInfinity: true, noNaN: true }),
						distanceDeltaMeters: fc.double({ min: 0, max: 5_000, noDefaultInfinity: true, noNaN: true }),
						firstRandom: fc.double({ min: 0, max: 1, noDefaultInfinity: true, noNaN: true }),
						secondRandom: fc.double({ min: 0, max: 1, noDefaultInfinity: true, noNaN: true }),
					}),
					(params) => {
						const fuzzyCoordinate = LocationUtils.fuzzLocationCoordinate({
							latitude: params.latitude,
							longitude: params.longitude,
							minDistanceMeters: params.minDistanceMeters,
							maxDistanceMeters: params.minDistanceMeters + params.distanceDeltaMeters,
							random: vi.fn().mockReturnValueOnce(params.firstRandom).mockReturnValueOnce(params.secondRandom),
						});

						expect(fuzzyCoordinate).not.toEqual({ latitude: params.latitude, longitude: params.longitude });
					},
				),
			);
		});

		it("should return a coordinate at least the requested minimum distance away", () => {
			const fuzzyCoordinate = LocationUtils.fuzzLocationCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
				random: vi.fn().mockReturnValueOnce(0.5).mockReturnValueOnce(0.25),
			});

			expect(
				LocationUtils.calculateDistanceMeters({ latitude: -23.55052, longitude: -46.633308 }, fuzzyCoordinate),
			).toBeGreaterThanOrEqual(300);
		});

		it("should keep fuzzy coordinate within the requested maximum distance", () => {
			const fuzzyCoordinate = LocationUtils.fuzzLocationCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
				random: vi.fn().mockReturnValueOnce(0.5).mockReturnValueOnce(0.25),
			});

			expect(
				LocationUtils.calculateDistanceMeters({ latitude: -23.55052, longitude: -46.633308 }, fuzzyCoordinate),
			).toBeLessThanOrEqual(500);
		});

		it("should always fuzz the coordinate when requested", () => {
			const fuzzyCoordinate = LocationUtils.fuzzLocationCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
				random: vi.fn().mockReturnValueOnce(0.5).mockReturnValueOnce(0.25),
			});

			expect(fuzzyCoordinate).not.toEqual({ latitude: -23.55052, longitude: -46.633308 });
		});
	});
});
