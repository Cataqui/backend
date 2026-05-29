import { validate } from "class-validator";
import { CreateJobLocationInputDto } from "./create-job-location-input.dto";

describe("CreateJobLocationInputDto", () => {
	describe("validation", () => {
		it("should pass with valid location data", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", street: "Rua das Flores, 123", neighborhood: "Centro" };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with optional street and neighborhood omitted", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR" };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail with city shorter than 2 chars", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "S", state: "SP", country: "BR" };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("city");
		});

		it("should fail with state not exactly 2 chars", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SPA", country: "BR" };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("state");
		});

		it("should fail with country not exactly 2 chars", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BRA" };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("country");
		});

		it("should fail with invalid 2-letter country code", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "XX" };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.property).toBe("country");
			expect(errors[0]?.constraints).toHaveProperty("isISO31661Alpha2");
		});
	});
});
