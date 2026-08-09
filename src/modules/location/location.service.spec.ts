import { LocationService } from "./location.service";

describe("LocationService", () => {
	const service = new LocationService();

	describe("fuzzCoordinate", () => {
		it("should offset the coordinate by the minimum distance when random returns zero", () => {
			const fuzzyCoordinate = service.fuzzCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
				random: vi.fn().mockReturnValue(0),
			});

			expect(fuzzyCoordinate).toEqual({ latitude: -23.547822, longitude: -46.633308 });
		});

		it("should offset the coordinate by the maximum distance when random selects the upper boundary", () => {
			const fuzzyCoordinate = service.fuzzCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
				random: vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(0.25),
			});

			expect(fuzzyCoordinate).toEqual({ latitude: -23.55052, longitude: -46.628403 });
		});

		it("should use Math.random when no random source is supplied", () => {
			vi.spyOn(Math, "random").mockReturnValueOnce(0.5).mockReturnValueOnce(0.25);

			service.fuzzCoordinate({
				latitude: -23.55052,
				longitude: -46.633308,
				minDistanceMeters: 300,
				maxDistanceMeters: 500,
			});

			expect(Math.random).toHaveBeenCalledTimes(2);
		});
	});
});
