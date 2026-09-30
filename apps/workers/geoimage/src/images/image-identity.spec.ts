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
