import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import type { MapImageInput } from "./map-image-input.interface";
import type { MapRepository } from "./map.repository";

export class MapService {
	private readonly _repository: () => MapRepository;

	constructor(params: { repository: () => MapRepository }) {
		this._repository = params.repository;
	}

	async generateImage(params: MapImageInput): Promise<Uint8Array> {
		const stream = await this._repository().getImage(params);
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		try {
			for (;;) {
				const chunk = await reader.read();
				if (chunk.done) break;
				size += chunk.value.length;
				if (size > 8 * 1024 * 1024) {
					await reader.cancel();
					throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);
				}
				chunks.push(chunk.value);
			}
		} catch (error) {
			if (error instanceof GeoimageError) throw error;
			throw new GeoimageError(
				error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
					? GeoimageErrorCode.PROVIDER_TIMEOUT
					: GeoimageErrorCode.PROVIDER_UNAVAILABLE,
			);
		} finally {
			reader.releaseLock();
		}
		if (size === 0) throw new GeoimageError(GeoimageErrorCode.PROVIDER_UNAVAILABLE);
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		chunks.length = 0;
		return bytes;
	}
}
