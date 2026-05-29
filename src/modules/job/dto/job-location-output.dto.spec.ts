import { instanceToPlain } from "class-transformer";
import { JobLocationOutputDto } from "./job-location-output.dto";

describe("JobLocationOutputDto", () => {
	describe("constructor", () => {
		it("should set all location fields", () => {
			const dto = new JobLocationOutputDto({ street: "Rua das Flores, 123", neighborhood: "Centro", city: "São Paulo", state: "SP", country: "BR" });

			expect(dto.street).toBe("Rua das Flores, 123");
			expect(dto.neighborhood).toBe("Centro");
			expect(dto.city).toBe("São Paulo");
			expect(dto.state).toBe("SP");
			expect(dto.country).toBe("BR");
		});

		it("should accept null street and neighborhood", () => {
			const dto = new JobLocationOutputDto({ street: null, neighborhood: null, city: "São Paulo", state: "SP", country: "BR" });

			expect(dto.street).toBeNull();
			expect(dto.neighborhood).toBeNull();
		});
	});

	describe("serialization", () => {
		it("should serialize all fields as snake_case", () => {
			const dto = new JobLocationOutputDto({ street: "Rua das Flores, 123", neighborhood: "Centro", city: "São Paulo", state: "SP", country: "BR" });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({
				street: "Rua das Flores, 123",
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
			});
		});
	});
});
