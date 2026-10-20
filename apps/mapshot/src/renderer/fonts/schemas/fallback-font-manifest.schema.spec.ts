import { FallbackFontManifestSchema, type FallbackFontManifest } from "./fallback-font-manifest.schema";

const _manifest = {
	schemaVersion: 1,
	fonts: [
		{
			family: "NotoSans",
			weight: 600,
			sha256: "a".repeat(64),
			bytes: 1,
			url: "https://raw.githubusercontent.com/Cataqui/backend/main/apps/mapshot/build/fonts/assets/sources/NotoSans.ttf",
			ranges: [[65, 65]],
		},
	],
	primaryCoverage: [[65, 65]],
	licenses: [
		{
			url: "https://raw.githubusercontent.com/Cataqui/backend/main/apps/mapshot/build/fonts/assets/sources/noto-fonts-OFL.txt",
			sha256: "b".repeat(64),
			bytes: 1,
		},
	],
} satisfies FallbackFontManifest;

it("accepts font and coverage counts above the former manifest quotas", () => {
	const ranges = Array.from({ length: 8193 }, (_value, index): [number, number] => [index * 2, index * 2]);
	const manifest = {
		..._manifest,
		fonts: Array.from({ length: 1025 }, (_value, index) => ({
			..._manifest.fonts[0]!,
			ranges: index === 0 ? ranges : _manifest.fonts[0]!.ranges,
		})),
		primaryCoverage: ranges,
		licenses: Array.from({ length: 9 }, () => _manifest.licenses[0]!),
	} satisfies FallbackFontManifest;
	expect(FallbackFontManifestSchema.parse(manifest).fonts).toHaveLength(1025);
});

it.each([15, 0xffff_ffff])("accepts the native unsigned face index %s", (faceIndex) => {
	const manifest = {
		..._manifest,
		fonts: [{ ..._manifest.fonts[0]!, faceIndex: faceIndex }],
	} satisfies FallbackFontManifest;
	expect(FallbackFontManifestSchema.parse(manifest).fonts[0]!.faceIndex).toBe(faceIndex);
});

it.each([-1, 0x1_0000_0000])("rejects a face index outside the native unsigned range: %s", (faceIndex) => {
	const manifest = {
		..._manifest,
		fonts: [{ ..._manifest.fonts[0]!, faceIndex: faceIndex }],
	} satisfies FallbackFontManifest;
	expect(FallbackFontManifestSchema.safeParse(manifest).success).toBe(false);
});

it("rejects overlapping and invalid Unicode coverage ranges", () => {
	for (const ranges of [
		[[66, 65]],
		[
			[65, 66],
			[66, 67],
		],
		[[0x11_0000, 0x11_0000]],
	]) {
		expect(FallbackFontManifestSchema.safeParse({ ..._manifest, primaryCoverage: ranges }).success).toBe(false);
		expect(
			FallbackFontManifestSchema.safeParse({ ..._manifest, fonts: [{ ..._manifest.fonts[0]!, ranges: ranges }] })
				.success,
		).toBe(false);
	}
});
