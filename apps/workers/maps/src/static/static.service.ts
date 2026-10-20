import { injectable } from "tsyringe";
import { AppError } from "../errors/app.error";
import { TransformationUnavailableError } from "./errors/transformation-unavailable.error";
import { LocationReferenceService } from "./location-reference.service";
import { StaticMapSizes } from "./static-map-size.schema";
import { StaticRepository, type GenerateStaticImageOutput } from "./static.repository";

@injectable()
export class StaticService {
	constructor(
		private readonly _repository: StaticRepository,
		private readonly _locationReferenceService: LocationReferenceService,
	) {}

	async generateImage(params: {
		reference: string;
		size: keyof typeof StaticMapSizes;
		signal?: AbortSignal | undefined;
	}): Promise<GenerateStaticImageOutput | null> {
		const center = await this._locationReferenceService.read(params.reference);
		if (center === null) return null;
		params.signal?.throwIfAborted();
		const size = StaticMapSizes[params.size];

		try {
			const image = await this._repository.generateImage({
				center: { latitude: center.latitude, longitude: center.longitude },
				zoom: 13,
				size: { width: size.width, height: size.height },
				signal: params.signal,
			});
			params.signal?.throwIfAborted();
			return image;
		} catch (error) {
			params.signal?.throwIfAborted();
			if (error instanceof AppError) throw error;
			throw new TransformationUnavailableError();
		}
	}
}
