import { GetStaticMapLocationUrlOutputSchema } from "./get-static-map-location-url-output.schema";

describe("static map location URL output", () => {
	it("returns a durable map URL", () => {
		const output = { url: "https://maps.cataqui.com/static/region" };
		expect(GetStaticMapLocationUrlOutputSchema.parse(output)).toEqual(output);
	});
	it.each([
		{},
		{ url: "http://maps.test/region" },
		{ url: "https://maps.test/region", id: "a".repeat(64) },
		{ kind: "ready", reference: { url: "https://maps.test/region" } },
		{ kind: "failed", code: "INTERNAL_ERROR", retryable: false },
	])("rejects invalid or legacy payloads %j", (value) => {
		expect(GetStaticMapLocationUrlOutputSchema.safeParse(value).success).toBe(false);
	});
});

it.each([
	"http://localhost:8787/static/v1/image.webp",
	"http://127.0.0.1:8787/static/v1/image.webp",
	"http://[::1]:8787/static/v1/image.webp",
])("accepts the local development map URL %s", (url) => {
	expect(GetStaticMapLocationUrlOutputSchema.parse({ url: url })).toEqual({ url: url });
});
