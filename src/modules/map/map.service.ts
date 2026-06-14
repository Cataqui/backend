import { Injectable, Inject } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { MAP_AUTH_CONFIG_KEY } from "../../core/config/map-auth.config";
import type { IMapAuthConfig } from "../../core/config/map-auth.config";
import { MapAuthConstants } from "./map-auth.constants";
import { MapConfigOutputDto } from "./dto/map-config-output.dto";
import { MapVersionRepository } from "./repositories/map-version.repository";
import { MapRegionNotFoundError } from "./errors/map-region-not-found.error";

@Injectable()
export class MapService {
	constructor(
		@Inject(MAP_AUTH_CONFIG_KEY) private readonly _mapAuthConfig: IMapAuthConfig,
		private readonly _mapVersionRepository: MapVersionRepository,
	) {}

	async getConfig(params: { region: string }): Promise<MapConfigOutputDto> {
		const mapVersion = await this._mapVersionRepository.findByRegionCode({
			regionCode: params.region.toUpperCase(),
		});

		if (!mapVersion) throw new MapRegionNotFoundError();

		return this._buildAuth({ region: params.region, mapFileName: mapVersion.mapFileName });
	}

	private _buildAuth(params: { region: string; mapFileName: string }): MapConfigOutputDto {
		const now = Date.now();
		const expiresAtMs = now + MapAuthConstants.AUTH_EXPIRATION_SECONDS * 1000;
		const expSeconds = Math.floor(expiresAtMs / 1000);
		const message = `${MapAuthConstants.AUTH_MESSAGE_PREFIX}:${expSeconds}`;
		const sig = createHmac("sha256", this._mapAuthConfig.authSecret).update(message).digest("hex");
		const queryParams = `v=${MapAuthConstants.AUTH_VERSION_PARAM}&sig=${sig}&exp=${expSeconds}`;
		const tilesUrlTemplate = `${this._mapAuthConfig.protomapUrl}/regions/${params.region.toLowerCase()}/${params.mapFileName}/{z}/{x}/{y}.mvt`;
		const glyphUrlTemplate = `${this._mapAuthConfig.protomapUrl}/glyphs/{fontstack}/{range}.pbf`;

		return new MapConfigOutputDto({
			queryParams,
			expiresAt: new Date(expiresAtMs).toISOString(),
			mapVersion: params.mapFileName,
			tilesUrlTemplate,
			glyphUrlTemplate,
		});
	}
}
