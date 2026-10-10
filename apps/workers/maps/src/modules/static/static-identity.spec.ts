import { StaticEncoding } from "./static-encoding";
import { StaticOutputs } from "./static-outputs";
import { getStaticGenerationIdentity, getStaticIdentity } from "./static-identity";

const input = { latitude: -23.5, longitude: -46.6 };
const params = { input: input, environment: "staging" };
describe("map asset identity", () => {
	it("reuses the same asset independently of the supported sizes", async () => {
		const id = await getStaticGenerationIdentity(params);
		const sizes = StaticOutputs.sizes;
		try {
			Object.defineProperty(StaticOutputs, "sizes", { value: [...sizes, { width: 320, height: 320 }] });
			expect(await getStaticGenerationIdentity(params)).toBe(id);
		} finally {
			Object.defineProperty(StaticOutputs, "sizes", { value: sizes });
		}
	});
	it("isolates locations and environments", async () => {
		const id = await getStaticGenerationIdentity(params);
		expect(await getStaticGenerationIdentity({ ...params, environment: "production" })).not.toBe(id);
		expect(await getStaticGenerationIdentity({ ...params, input: { ...input, longitude: -46.7 } })).not.toBe(id);
	});
	it("changes the asset and its variants when the rendering revision changes", async () => {
		const id = await getStaticGenerationIdentity(params);
		const variant = { assetId: id, size: { width: 480, height: 480 }, scale: 2, zoom: 13 };
		const key = await getStaticIdentity(variant);
		const revision = StaticEncoding.revision;
		try {
			Object.defineProperty(StaticEncoding, "revision", { value: `${revision}-next` });
			const nextId = await getStaticGenerationIdentity(params);
			expect(nextId).not.toBe(id);
			expect(await getStaticIdentity({ ...variant, assetId: nextId })).not.toBe(key);
		} finally {
			Object.defineProperty(StaticEncoding, "revision", { value: revision });
		}
	});
	it("isolates every variant dimension and reuses identical variants", async () => {
		const variant = {
			assetId: await getStaticGenerationIdentity(params),
			size: { width: 480, height: 480 },
			scale: 2,
			zoom: 13,
		};
		const key = await getStaticIdentity(variant);
		expect(await getStaticIdentity(variant)).toBe(key);
		for (const next of [
			{ ...variant, size: { width: 480, height: 1280 } },
			{ ...variant, scale: 1 },
			{ ...variant, zoom: 14 },
		])
			expect(await getStaticIdentity(next)).not.toBe(key);
	});
});
