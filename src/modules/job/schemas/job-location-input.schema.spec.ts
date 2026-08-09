import fc from "fast-check";
import type { z } from "zod";
import { JobLocationInputSchema } from "./job-location-input.schema";

interface ITestValidationIssue {
	property: string;
	constraints: Record<string, string>;
}

async function validate(value: unknown): Promise<ITestValidationIssue[]> {
	const result = JobLocationInputSchema.safeParse(value);
	if (result.success) return [];

	return result.error.issues.map((issue) => {
		const property = String(issue.path[0] ?? "");
		const constraint =
			property === "latitude"
				? "isLatitude"
				: property === "longitude"
					? "isLongitude"
					: property === "country"
						? "isISO31661Alpha2"
						: issue.code;

		return { property: property, constraints: { [constraint]: issue.message } };
	});
}

function buildLocationInput(
	overrides: Partial<z.infer<typeof JobLocationInputSchema>>,
): z.infer<typeof JobLocationInputSchema> {
	return Object.assign(
		{},
		{
			city: "São Paulo",
			state: "SP",
			country: "BR",
			neighborhood: "Centro",
			latitude: -23.55052,
			longitude: -46.633308,
			...overrides,
		},
	);
}

function hasConstraint(errors: ITestValidationIssue[], property: string, constraint: string): boolean {
	return errors.some((error) => error.property === property && Object.hasOwn(error.constraints ?? {}, constraint));
}

describe("JobLocationInputSchema", () => {
	describe("validation", () => {
		it("should pass with valid location data", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				street: "Rua das Flores, 123",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should pass with optional street omitted", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors).toHaveLength(0);
		});

		it("should trim location labels and uppercase state and country", () => {
			const result = JobLocationInputSchema.parse(
				buildLocationInput({
					street: "  Rua das Flores, 123  ",
					neighborhood: "  Centro  ",
					city: "  São Paulo  ",
					state: "sp",
					country: "br",
				}),
			);

			expect(result).toMatchObject({
				street: "Rua das Flores, 123",
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
			});
		});

		it.each(["street", "neighborhood", "city", "state"] as const)("should reject whitespace-only %s", (property) => {
			const result = JobLocationInputSchema.safeParse(buildLocationInput({ [property]: "  " }));

			expect(result.success).toBe(false);
		});

		it("should fail when neighborhood is omitted", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("neighborhood");
		});

		it("should fail with city shorter than 2 chars", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "S",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("city");
		});

		it("should fail with state not exactly 2 chars", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SPA",
				country: "BR",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("state");
		});

		it("should fail with country not exactly 2 chars", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "BRA",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("country");
		});

		it("should fail with invalid 2-letter country code", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "XX",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors[0]?.constraints).toHaveProperty("isISO31661Alpha2");
		});

		it("should fail when latitude is omitted", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("latitude");
		});

		it("should fail when longitude is omitted", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				latitude: -23.55052,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("longitude");
		});

		it("should fail when latitude is outside valid range", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				latitude: -91,
				longitude: -46.633308,
			};
			const dto = Object.assign({}, data);
			const errors = await validate(dto);

			expect(errors[0]?.property).toBe("latitude");
		});

		it("should fail when longitude is outside valid range", async () => {
			const data: Partial<z.infer<typeof JobLocationInputSchema>> = {
				city: "São Paulo",
				state: "SP",
				country: "BR",
				neighborhood: "Centro",
				latitude: -23.55052,
				longitude: -181,
			};
			const dto = Object.assign({}, data);
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
						const errors = await validate(buildLocationInput({ latitude, longitude }));

						expect(errors).toHaveLength(0);
					},
				),
			);
		});

		it("should reject fuzzed invalid latitude values", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.oneof(
						fc.integer({ min: -10_000_000_000, max: -90_000_001 }),
						fc.integer({ min: 90_000_001, max: 10_000_000_000 }),
					),
					async (latitudeValue) => {
						const errors = await validate(buildLocationInput({ latitude: latitudeValue / 1_000_000 }));

						expect(hasConstraint(errors, "latitude", "isLatitude")).toBe(true);
					},
				),
			);
		});

		it("should reject fuzzed invalid longitude values", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.oneof(
						fc.integer({ min: -10_000_000_000, max: -180_000_001 }),
						fc.integer({ min: 180_000_001, max: 10_000_000_000 }),
					),
					async (longitudeValue) => {
						const errors = await validate(buildLocationInput({ longitude: longitudeValue / 1_000_000 }));

						expect(hasConstraint(errors, "longitude", "isLongitude")).toBe(true);
					},
				),
			);
		});
	});
});
