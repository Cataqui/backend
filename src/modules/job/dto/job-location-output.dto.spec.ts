import { instanceToPlain } from "class-transformer";
import { JobLocationOutputDto } from "./job-location-output.dto";

describe("JobLocationOutputDto", () => {
	describe("constructor", () => {
		it("should set all location fields", () => {
			const dto = new JobLocationOutputDto({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
			});

			expect(dto).toMatchObject({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2000,
			});
		});

		it("should convert Decimal-like coordinates to numbers", () => {
			const dto = new JobLocationOutputDto({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: { toNumber: () => -23.55 },
				longitude: { toNumber: () => -46.63 },
			});

			expect(dto.latitude).toBe(-23.55);
		});
	});

	describe("serialization", () => {
		it("should serialize all fields as snake_case", () => {
			const dto = new JobLocationOutputDto({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
				area_radius: 2000,
			});
		});

		it("should not serialize street", () => {
			const dto = new JobLocationOutputDto({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
			});
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("street");
		});
	});
});
