import * as td from "testdouble";
import { LocationService } from "./location.service";

afterEach(() => td.reset());

describe("LocationService", () => {
	const service = new LocationService();

	describe("fuzzCoordinate", () => {
		it("should offset the coordinate by the minimum distance when random returns zero", () => {
			const random = td.func<() => number>();
			td.when(random()).thenReturn(0);
			const fuzzyCoordinate = service.fuzzCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
				random: random,
			});

			expect(fuzzyCoordinate).toEqual({ latitude: -23.547822, longitude: -46.633308 });
		});

		it("should offset the coordinate by the maximum distance when random selects the upper boundary", () => {
			const random = td.func<() => number>();
			td.when(random(), { times: 2 }).thenReturn(1, 0.25);
			const fuzzyCoordinate = service.fuzzCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
				random: random,
			});

			expect(fuzzyCoordinate).toEqual({ latitude: -23.55052, longitude: -46.628403 });
		});

		it("should use Math.random when no random source is supplied", () => {
			const originalRandom = Math.random;
			td.replace(Math, "random");
			td.when(Math.random()).thenDo(originalRandom);
			td.when(Math.random(), { times: 2 }).thenReturn(0.5, 0.25);

			service.fuzzCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
			});

			expect(td.explain(Math.random).callCount).toBe(2);
		});

		it("should supply a valid map coordinate after crossing the antimeridian eastward", () => {
			const random = td.func<() => number>();
			td.when(random()).thenReturn(0.25);
			const fuzzyCoordinate = service.fuzzCoordinate({
				latitude: 0,
				longitude: 180,
				minDistanceMeters: 300,
				maxDistanceMeters: 300,
				random: random,
			});

			expect(fuzzyCoordinate).toEqual({ latitude: 0, longitude: -179.997302 });
		});

		it("should supply a valid map coordinate after crossing the antimeridian westward", () => {
			const random = td.func<() => number>();
			td.when(random()).thenReturn(0.75);
			const fuzzyCoordinate = service.fuzzCoordinate({
				latitude: 0,
				longitude: -180,
				minDistanceMeters: 300,
				maxDistanceMeters: 300,
				random: random,
			});

			expect(fuzzyCoordinate).toEqual({ latitude: -0, longitude: 179.997302 });
		});

		it("should preserve positive 180 degrees when the fuzzy coordinate does not cross the antimeridian", () => {
			const random = td.func<() => number>();
			td.when(random()).thenReturn(0);
			const fuzzyCoordinate = service.fuzzCoordinate({
				latitude: 0,
				longitude: 180,
				minDistanceMeters: 0,
				maxDistanceMeters: 0,
				random: random,
			});

			expect(fuzzyCoordinate).toEqual({ latitude: 0, longitude: 180 });
		});

		it("should preserve negative 180 degrees when the fuzzy coordinate does not cross the antimeridian", () => {
			const random = td.func<() => number>();
			td.when(random()).thenReturn(0);
			const fuzzyCoordinate = service.fuzzCoordinate({
				latitude: 0,
				longitude: -180,
				minDistanceMeters: 0,
				maxDistanceMeters: 0,
				random: random,
			});

			expect(fuzzyCoordinate).toEqual({ latitude: 0, longitude: -180 });
		});
	});
});
