import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import { inject, injectable } from "tsyringe";
import { raceWithSignal } from "@cataqui/async";
import type { GetStaticMapLocationUrlInput } from "./get-static-map-location-url-input.schema";

export interface GenerateStaticImageOutput {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: "image/webp";
	digest: string;
}

export const MapshotBinding = Symbol("MapshotBinding");

@injectable()
export class StaticRepository {
	constructor(@inject(MapshotBinding) mapshot: MapsWorkerEnv["MAPSHOT"]) {
		this._mapshot = mapshot;
	}
	private readonly _mapshot: MapsWorkerEnv["MAPSHOT"];

	async generateImage(params: {
		center: GetStaticMapLocationUrlInput;
		zoom: 13;
		size: { width: number; height: number };
		signal?: AbortSignal | undefined;
	}): Promise<GenerateStaticImageOutput> {
		const output = await raceWithSignal(
			async (): Promise<GenerateStaticImageOutput> => {
				using rendered = await this._mapshot.render({
					center: { latitude: params.center.latitude, longitude: params.center.longitude },
					zoom: params.zoom,
					size: { width: params.size.width, height: params.size.height },
				});
				if (params.signal?.aborted) {
					await rendered.bytes.cancel(params.signal.reason);
					params.signal.throwIfAborted();
				}
				const bytes = await new Response(
					params.signal === undefined
						? rendered.bytes
						: rendered.bytes.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal: params.signal }),
				).arrayBuffer();
				return {
					bytes: new Uint8Array(bytes),
					contentType: rendered.contentType,
					digest: rendered.digest,
				};
			},
			{ signal: params.signal },
		);
		params.signal?.throwIfAborted();
		return output;
	}
}
