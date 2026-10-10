import { GenerateStaticMapsResultSchema } from "./generate-static-maps-result.schema.js";

describe("generation result", () => {
	it("accepts one ready asset", () => {
		expect(
			GenerateStaticMapsResultSchema.safeParse({
				kind: "ready",
				asset: { id: "a".repeat(64), url: "https://maps.cataqui.com/static/asset" },
			}).success,
		).toBe(true);
	});
	it.each([
		{ kind: "ready" },
		{ kind: "ready", images: [] },
		{ kind: "ready", asset: { id: "bad", url: "http://maps.test/asset" } },
	])("rejects invalid success %j", (value) => {
		expect(GenerateStaticMapsResultSchema.safeParse(value).success).toBe(false);
	});
	it("accepts a retryable preparation failure", () => {
		expect(
			GenerateStaticMapsResultSchema.safeParse({ kind: "failed", code: "STORAGE_UNAVAILABLE", retryable: true })
				.success,
		).toBe(true);
	});
});
