import { type R2ArchiveRangeInput, R2ArchiveRangeInputSchema } from "./r2-archive-range-input.schema";

describe("archive range input", () => {
	it("accepts an exact bounded range", () => {
		const input = {
			key: "source/archive.pmtiles",
			etag: "object-etag",
			offset: 4,
			length: 2,
		} satisfies R2ArchiveRangeInput;
		expect(R2ArchiveRangeInputSchema.parse(input)).toEqual(input);
	});

	it("accepts a range larger than one archive verification batch", () => {
		const input = {
			key: "source/archive.pmtiles",
			etag: "object-etag",
			offset: 4,
			length: 64 * 1024 * 1024 + 1,
		} satisfies R2ArchiveRangeInput;
		expect(R2ArchiveRangeInputSchema.parse(input)).toEqual(input);
	});

	it.each([
		{ key: "../outside" },
		{ key: "source//archive.pmtiles" },
		{ etag: '"quoted-input"' },
		{ etag: "weak etag" },
		{ offset: -1 },
		{ offset: 0.5 },
		{ offset: Number.MAX_SAFE_INTEGER },
		{ length: 0 },
		{ length: 0.5 },
		{ length: Number.MAX_SAFE_INTEGER + 1 },
	])("rejects invalid range input: %j", (invalid) => {
		expect(
			R2ArchiveRangeInputSchema.safeParse({
				key: "source/archive.pmtiles",
				etag: "object-etag",
				offset: 0,
				length: 2,
				...invalid,
			}).success,
		).toBe(false);
	});
});
