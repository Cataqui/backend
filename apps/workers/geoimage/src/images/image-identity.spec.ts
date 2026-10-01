import { getImageIdentity } from "./image-identity";

it("normalizes negative zero and keeps logical size, density and environment in image identity", async () => {
	const input = { latitude: 0, longitude: 0, map: { size: { width: 480, height: 480 }, density: 1 } } as const;
	const original = await getImageIdentity({ input: input, environment: "development" });
	expect(await getImageIdentity({ input: { ...input, latitude: -0, longitude: -0 }, environment: "development" })).toBe(
		original,
	);
	expect(
		await getImageIdentity({
			input: { ...input, map: { ...input.map, density: 2 } },
			environment: "development",
		}),
	).not.toBe(original);
	expect(
		await getImageIdentity({
			input: { ...input, map: { ...input.map, size: { width: 480, height: 1280 } } },
			environment: "development",
		}),
	).not.toBe(original);
	expect(await getImageIdentity({ input: input, environment: "production" })).not.toBe(original);
	expect(original).not.toContain("latitude");
});

it.each([
	"osm-bright-jpeg-zoom13-v1",
	"cataqui-light-jpeg-zoom13-v2",
	"cataqui-light-jpeg-zoom13-v3",
	"cataqui-light-jpeg-zoom13-v4",
	"cataqui-light-jpeg-zoom13-v5",
	"cataqui-light-jpeg-zoom13-v6",
	"cataqui-light-jpeg-zoom13-v7",
	"cataqui-light-jpeg-zoom13-v8",
	"cataqui-light-jpeg-zoom13-v9",
	"cataqui-light-jpeg-zoom13-v10",
	"cataqui-light-jpeg-zoom13-v11",
])("does not reuse a %s image after refining the light style", async (version) => {
	const input = { latitude: 0, longitude: 0, map: { size: { width: 480, height: 480 }, density: 1 } } as const;
	const oldIdentity = new TextEncoder().encode(JSON.stringify([version, "development", 0, 0, 480, 480, 1]));
	const oldHash = await crypto.subtle.digest("SHA-256", oldIdentity);
	const oldKey = `maps/v1/${Array.from(new Uint8Array(oldHash), (byte) => byte.toString(16).padStart(2, "0")).join("")}.jpg`;
	expect(await getImageIdentity({ input: input, environment: "development" })).not.toBe(oldKey);
});
