import { expect, it } from "vitest";
import { MapshotDataToolInputSchema } from "./mapshot-data-tool-input.schema";

it("rejects a storage range whose end exceeds the safe integer boundary", () => {
	const result = MapshotDataToolInputSchema.safeParse({
		operation: "storage.readRange",
		environment: "staging",
		key: "artifact",
		offset: Number.MAX_SAFE_INTEGER,
		length: 1,
		etag: "stored-etag",
		path: "/tmp/archive-range.body",
	});
	expect(result.success).toBe(false);
});

it("accepts a storage range ending at the safe integer boundary", () => {
	const result = MapshotDataToolInputSchema.safeParse({
		operation: "storage.readRange",
		environment: "staging",
		key: "artifact",
		offset: Number.MAX_SAFE_INTEGER - 1,
		length: 1,
		etag: "stored-etag",
		path: "/tmp/archive-range.body",
	});
	expect(result.success).toBe(true);
});

it("accepts a storage range larger than one archive verification batch", () => {
	const result = MapshotDataToolInputSchema.safeParse({
		operation: "storage.readRange",
		environment: "staging",
		key: "artifact",
		offset: 0,
		length: 64 * 1024 * 1024 + 1,
		etag: "stored-etag",
		path: "/tmp/archive-range.body",
	});
	expect(result.success).toBe(true);
});
