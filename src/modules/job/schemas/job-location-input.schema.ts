import { getCountries } from "libphonenumber-js";
import { z } from "zod";

export const JobLocationInputSchema = z
	.object({
		street: z.string().trim().min(1).max(200).optional().describe("Street address"),
		neighborhood: z.string().trim().min(2).max(100).describe("Neighborhood or district"),
		city: z.string().trim().min(2).max(100).describe("City name"),
		state: z
			.string()
			.trim()
			.length(2)
			.transform((state) => state.toUpperCase())
			.describe("State code (2 chars)"),
		country: z
			.string()
			.trim()
			.length(2)
			.transform((country) => country.toUpperCase())
			.refine((country) => getCountries().some((candidate) => candidate === country), {
				error: "country must be an ISO 3166-1 alpha-2 country code. Example: BR",
			})
			.describe("Country code (ISO 3166-1 alpha-2)"),
		latitude: z
			.number()
			.min(-90)
			.max(90)
			.describe("Real latitude of the location or neighborhood's latitude if real location is unknown"),
		longitude: z
			.number()
			.min(-180)
			.max(180)
			.describe("Real longitude of the location or neighborhood's longitude if real location is unknown"),
	})
	.strict()
	.meta({ id: "JobLocationInput" });
