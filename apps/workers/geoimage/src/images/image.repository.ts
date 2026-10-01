import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import { createImageResponse, ImageCacheControl } from "./image-response";

export class ImageRepository {
	private readonly _bucket: R2Bucket;
	constructor(params: { bucket: R2Bucket }) {
		this._bucket = params.bucket;
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
}
