import { z } from "zod";
import { PackedLandmarkRowSchema } from "../../../../../src/landmark/index/schemas/packed-landmark-row.schema";

const _columns = PackedLandmarkRowSchema.def.items;

// Physical content identity and exact source geometry precede the compact output fields.
export const WorldwidePointSpoolRowSchema = z.tuple([
	z.int().nonnegative(),
	z
		.int()
		.positive()
		.max(2 ** 30),
	z
		.int()
		.min((4 ** 15 - 1) / 3)
		.max((4 ** 16 - 1) / 3 - 1),
	z.int().nonnegative(),
	_columns[0],
	_columns[3],
	_columns[1],
	_columns[2],
	_columns[4],
	_columns[7],
	_columns[8],
	z.number(),
	z.number(),
]);

export type WorldwidePointSpoolRow = z.output<typeof WorldwidePointSpoolRowSchema>;
