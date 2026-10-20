import { z } from "zod";

const _ranges = z
	.array(z.tuple([z.int().min(0).max(0x10ffff), z.int().min(0).max(0x10ffff)]).refine(([first, last]) => first <= last))
	.superRefine((ranges, context) => {
		for (let index = 1; index < ranges.length; index++) {
			if (ranges[index]![0] <= ranges[index - 1]![1])
				context.addIssue({ code: "custom", path: [index], message: "Coverage ranges must be ordered and disjoint." });
		}
	});
const _asset = z.strictObject({
	url: z
		.string()
		.regex(
			/^https:\/\/raw\.githubusercontent\.com\/(?:notofonts\/(?:noto-fonts|noto-cjk)\/[a-f0-9]{40}\/[A-Za-z0-9./_-]+|Cataqui\/backend\/main\/apps\/mapshot\/build\/fonts\/assets\/sources\/[A-Za-z0-9._-]+)$/u,
		),
	sha256: z.string().regex(/^[a-f0-9]{64}$/u),
	bytes: z.int().positive(),
});

export const FallbackFontManifestSchema = z.strictObject({
	schemaVersion: z.literal(1),
	// URLs preserve source provenance; hashes and sizes identify the packaged font faces.
	fonts: z
		.array(
			_asset.extend({
				family: z.string().regex(/^(?:NotoSans[A-Za-z0-9]*|NotoSerifTibetan)$/u),
				weight: z.union([z.literal(400), z.literal(600), z.literal(700)]),
				faceIndex: z.int().min(0).max(0xffff_ffff).optional(),
				ranges: _ranges,
			}),
		)
		.min(1),
	primaryCoverage: _ranges,
	licenses: z.array(_asset).min(1),
});

export type FallbackFontManifest = z.output<typeof FallbackFontManifestSchema>;
