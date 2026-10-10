/** Shared stored and delivered representation; independent of HTTP adapters. */
export const StaticRepresentation = {
	contentType: "image/webp",
	cacheControl: "public, max-age=31536000, immutable",
} as const;
