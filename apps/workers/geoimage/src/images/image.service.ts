import type { z } from "zod";
import { GeoimageError } from "../geoimage.error";
import type { ImageGenerationDurableObject } from "./image-generation.durable-object";
import { getImageIdentity } from "./image-identity";
import type { ImageRepository } from "./image.repository";
import type { ImageQuerySchema } from "./schemas/image-query.schema";

export class ImageService {
	private readonly _images: ImageRepository;
	private readonly _generation: DurableObjectNamespace<ImageGenerationDurableObject>;

	constructor(params: {
		images: ImageRepository;
		generation: DurableObjectNamespace<ImageGenerationDurableObject>;
	}) {
		this._images = params.images;
		this._generation = params.generation;
	}

	async getImage(params: {
		input: z.output<typeof ImageQuerySchema>;
		environment: GeoimageWorkerEnv["ENVIRONMENT"];
		origin: string;
		requestId: string;
		waitUntil: (promise: Promise<void>) => void;
	}): Promise<Response> {
		const key = await getImageIdentity({ input: params.input, environment: params.environment });
		const cacheKey = new Request(`${params.origin}/__geoimage-cache/${key}`);
		const cached = await this._images.getCachedImage({ key: cacheKey, requestId: params.requestId });
		if (cached !== undefined) return cached;
		const stored = await this._images.getStoredImage({ key: key });
		let response: Response;
		if (stored !== null) {
			response = stored;
		} else {
			const result = await this._generation.getByName(key).generate({
				key: key,
				map: {
					center: { latitude: params.input.latitude, longitude: params.input.longitude },
					size: params.input.map.size,
					density: params.input.map.density,
				},
				requestId: params.requestId,
			});
			if ("errorCode" in result) throw new GeoimageError(result.errorCode);
			response = result.response;
		}
		params.waitUntil(
			this._images.saveCachedImage({ key: cacheKey, response: response.clone(), requestId: params.requestId }),
		);
		return response;
	}
}
