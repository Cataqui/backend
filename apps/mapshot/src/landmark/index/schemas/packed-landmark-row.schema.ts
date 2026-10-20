import { z } from "zod";
import { PackedLandmarkKinds } from "../packed-landmark-format";

export const PackedLandmarkRowSchema = z
	.tuple([
		z
			.string()
			.regex(/^(?:0|[1-9][0-9]{0,19})$/u)
			.refine((value) => /^(?:0|[1-9][0-9]{0,19})$/u.test(value) && BigInt(value) <= 18446744073709551615n),
		z.string(),
		z.record(z.string().min(1), z.string()),
		z.enum(PackedLandmarkKinds),
		z.string().nullable(),
		z.number().min(-180).lt(180),
		z.number().min(-85.05112878).max(85.05112878),
		z.number().nonnegative().nullable(),
		z.number().nullable(),
	])
	.refine(
		(row) =>
			row[1].trim().length > 0 ||
			Object.entries(row[2]).some(
				([key, value]) => (key === "name2" || key === "name3" || key.startsWith("name:")) && value.trim().length > 0,
			),
		{ message: "A landmark must retain a real provider name." },
	);

export type PackedLandmarkRow = z.output<typeof PackedLandmarkRowSchema>;
