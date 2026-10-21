import type { z } from "zod";
import { ProtomapsBuildsOutputSchema } from "./protomaps-builds-output.schema";

const _build = {
	key: "20261019.pmtiles",
	size: 127,
	uploaded: "2026-10-19T00:00:00Z",
	version: "4.15.2",
	b3sum: "a".repeat(64),
} satisfies z.input<typeof ProtomapsBuildsOutputSchema>[number];

describe("Protomaps build discovery output", () => {
	it("accepts a build history exceeding the former entry quota", () => {
		const input = Array.from({ length: 4097 }, () => _build);
		expect(ProtomapsBuildsOutputSchema.parse(input)).toEqual(input);
	});

	it("accepts historical metadata without applying selected-archive format restrictions", () => {
		const input = [{ ..._build, key: "k".repeat(257), version: "v".repeat(81), b3sum: "b".repeat(257) }];
		expect(ProtomapsBuildsOutputSchema.parse(input)).toEqual(input);
	});

	it.each([
		{ key: null },
		{ size: 126 },
		{ size: Number.MAX_SAFE_INTEGER + 1 },
		{ uploaded: "invalid" },
		{ version: null },
		{ b3sum: null },
	])("rejects malformed discovery fields: %j", (fields) => {
		expect(ProtomapsBuildsOutputSchema.safeParse([{ ..._build, ...fields }]).success).toBe(false);
	});
});
