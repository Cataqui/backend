import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import { createImageResponse, ImageCacheControl } from "./image-response";

export class ImageRepository {
	private readonly _bucket: R2Bucket;
	private readonly _cache: Cache;
	constructor(params: { bucket: R2Bucket; cache: Cache }) {
		this._bucket = params.bucket;
		this._cache = params.cache;
	}

	async getStoredImage(params: { key: string }): Promise<Response | null> {
		let object: R2ObjectBody | null;
		try {
			object = await this._bucket.get(params.key);
		} catch {
			throw new GeoimageError(GeoimageErrorCode.STORAGE_UNAVAILABLE);
		}
		if (object === null) return null;
		return createImageResponse({ body: object.body, etag: object.httpEtag, size: object.size });
	}

	async saveStoredImage(params: { key: string; bytes: Uint8Array }): Promise<{ etag: string }> {
		let object: R2Object | null;
		try {
			object = await this._bucket.put(params.key, params.bytes, {
				httpMetadata: { contentType: "image/jpeg", cacheControl: ImageCacheControl },
			});
		} catch {
			throw new GeoimageError(GeoimageErrorCode.STORAGE_UNAVAILABLE);
		}
		if (object === null) throw new GeoimageError(GeoimageErrorCode.STORAGE_UNAVAILABLE);
		return { etag: object.httpEtag };
	}

	async getCachedImage(params: { key: Request; requestId: string }): Promise<Response | undefined> {
		try {
			return await this._cache.match(params.key);
		} catch {
			console.error({ event: "geoimage.cache.read.failed", requestId: params.requestId });
			return undefined;
		}
	}

	async saveCachedImage(params: { key: Request; response: Response; requestId: string }): Promise<void> {
		try {
			const response = new Response(params.response.body, params.response);
			response.headers.delete("x-request-id");
			response.headers.delete("Set-Cookie");
			await this._cache.put(params.key, response);
		} catch {
			console.error({ event: "geoimage.cache.write.failed", requestId: params.requestId });
		}
	}
}
