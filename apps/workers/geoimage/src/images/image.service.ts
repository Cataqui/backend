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
		requestId: string;
	}): Promise<Response> {
		const key = await getImageIdentity({ input: params.input, environment: params.environment });
		const stored = await this._images.getStoredImage({ key: key });
		if (stored !== null) return stored;
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
		return result.response;
	}
}
