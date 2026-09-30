export const ImageCacheControl = "public, max-age=86400, s-maxage=31536000";

export function createImageResponse(params: { body: BodyInit; etag?: string | undefined; size: number }): Response {
	const headers = new Headers({
		"Content-Type": "image/jpeg",
		"Cache-Control": ImageCacheControl,
		"Content-Length": String(params.size),
	});
	if (params.etag !== undefined) headers.set("ETag", params.etag);
	return new Response(params.body, { headers: headers });
}
