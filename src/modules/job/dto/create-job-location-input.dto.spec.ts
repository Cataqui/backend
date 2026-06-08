import fc from "fast-check";
import { validate } from "class-validator";
import { CreateJobLocationInputDto } from "./create-job-location-input.dto";

function buildLocationDto(overrides: Partial<CreateJobLocationInputDto>): CreateJobLocationInputDto {
	return Object.assign(new CreateJobLocationInputDto(), {
		city: "São Paulo",
		state: "SP",
		country: "BR",
		neighborhood: "Centro",
		latitude: -23.55052,
		longitude: -46.633308,
		...overrides,
	});
}

function hasConstraint(errors: Awaited<ReturnType<typeof validate>>, property: string, constraint: string): boolean {
	return errors.some((error) => error.property === property && Object.hasOwn(error.constraints ?? {}, constraint));
}

describe("CreateJobLocationInputDto", () => {
	describe("validation", () => {
		it("should pass with valid location data", async () => {
			const data: Partial<CreateJobLocationInputDto> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				street: "Rua das Flores, 123",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with optional street omitted", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", neighborhood: "Centro", latitude: -23.55052, longitude: -46.633308 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should fail when neighborhood is omitted", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", latitude: -23.55052, longitude: -46.633308 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("neighborhood");
		});

		it("should fail with city shorter than 2 chars", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "S", state: "SP", country: "BR", neighborhood: "Centro", latitude: -23.55052, longitude: -46.633308 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("city");
		});

		it("should fail with state not exactly 2 chars", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SPA", country: "BR", neighborhood: "Centro", latitude: -23.55052, longitude: -46.633308 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("state");
		});

		it("should fail with country not exactly 2 chars", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BRA", neighborhood: "Centro", latitude: -23.55052, longitude: -46.633308 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("country");
		});

		it("should fail with invalid 2-letter country code", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "XX", neighborhood: "Centro", latitude: -23.55052, longitude: -46.633308 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.constraints).toHaveProperty("isISO31661Alpha2");
		});

		it("should fail when latitude is omitted", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", neighborhood: "Centro", longitude: -46.633308 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("latitude");
		});

		it("should fail when longitude is omitted", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", neighborhood: "Centro", latitude: -23.55052 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("longitude");
		});

		it("should fail when latitude is outside valid range", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", neighborhood: "Centro", latitude: -91, longitude: -46.633308 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("latitude");
		});

		it("should fail when longitude is outside valid range", async () => {
			const data: Partial<CreateJobLocationInputDto> = { city: "São Paulo", state: "SP", country: "BR", neighborhood: "Centro", latitude: -23.55052, longitude: -181 };
			const dto = Object.assign(new CreateJobLocationInputDto(), data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("longitude");
		});

		it("should pass with fuzzed valid latitude and longitude values", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						latitude: fc.integer({ min: -90_000_000, max: 90_000_000 }).map((value) => value / 1_000_000),
						longitude: fc.integer({ min: -180_000_000, max: 180_000_000 }).map((value) => value / 1_000_000),
					}),
					async ({ latitude, longitude }) => {
						const errors = await validate(buildLocationDto({ latitude, longitude }));

						expect(errors).toHaveLength(0);
					},
				),
			);
		});

		it("should reject fuzzed invalid latitude values", async () => {
			await fc.assert(
				fc.asyncProperty(fc.oneof(fc.integer({ min: -10_000_000_000, max: -90_000_001 }), fc.integer({ min: 90_000_001, max: 10_000_000_000 })), async (latitudeValue) => {
					const errors = await validate(buildLocationDto({ latitude: latitudeValue / 1_000_000 }));

					expect(hasConstraint(errors, "latitude", "isLatitude")).toBe(true);
				}),
			);
		});

		it("should reject fuzzed invalid longitude values", async () => {
			await fc.assert(
				fc.asyncProperty(fc.oneof(fc.integer({ min: -10_000_000_000, max: -180_000_001 }), fc.integer({ min: 180_000_001, max: 10_000_000_000 })), async (longitudeValue) => {
					const errors = await validate(buildLocationDto({ longitude: longitudeValue / 1_000_000 }));

					expect(hasConstraint(errors, "longitude", "isLongitude")).toBe(true);
				}),
			);
		});
	});
});
