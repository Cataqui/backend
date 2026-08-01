import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { IMapAuthConfig } from "../../core/config/map-auth.config";
import { MAP_AUTH_CONFIG_KEY } from "../../core/config/map-auth.config";
import { MapConfigOutputDto } from "./dto/map-config-output.dto";
import { MapRegionNotFoundError } from "./errors/map-region-not-found.error";
import { MapAuthConstants } from "./map-auth.constants";
import { MapVersionRepository } from "./repositories/map-version.repository";

interface ILocationCoordinate {
	latitude: number;
	longitude: number;
}

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

		return this._buildAuth({
			region: params.region,
			mapFileName: mapVersion.mapFileName,
			fontstack: mapVersion.fontstack,
		});
	}

	fuzzLocationCoordinate(
		params: ILocationCoordinate & {
			minDistanceMeters: number;
			maxDistanceMeters: number;
			random?: (() => number) | undefined;
		},
	): ILocationCoordinate {
		const random = params.random ?? Math.random;
		const distanceMeters = params.minDistanceMeters + random() * (params.maxDistanceMeters - params.minDistanceMeters);
		const bearingRadians = random() * (Math.PI * 2);

		return this._calculateOffsetCoordinate({
			latitude: params.latitude,
			longitude: params.longitude,
			distanceMeters: distanceMeters,
			bearingRadians: bearingRadians,
		});
	}

	private _buildAuth(params: { region: string; mapFileName: string; fontstack: string }): MapConfigOutputDto {
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
			fontstack: params.fontstack,
			tilesUrlTemplate,
			glyphUrlTemplate,
		});
	}

	private _calculateOffsetCoordinate(
		params: ILocationCoordinate & { distanceMeters: number; bearingRadians: number },
	): ILocationCoordinate {
		const latitudeRadians = this._degreesToRadians(params.latitude);
		const longitudeRadians = this._degreesToRadians(params.longitude);
		const angularDistance = params.distanceMeters / 6_371_000;

		const fuzzyLatitudeRadians = Math.asin(
			Math.sin(latitudeRadians) * Math.cos(angularDistance) +
				Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(params.bearingRadians),
		);

		const fuzzyLongitudeRadians =
			longitudeRadians +
			Math.atan2(
				Math.sin(params.bearingRadians) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
				Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(fuzzyLatitudeRadians),
			);

		return {
			latitude: Number(this._radiansToDegrees(fuzzyLatitudeRadians).toFixed(6)),
			longitude: Number(this._radiansToDegrees(fuzzyLongitudeRadians).toFixed(6)),
		};
	}

	private _degreesToRadians(degrees: number): number {
		return (degrees * Math.PI) / 180;
	}

	private _radiansToDegrees(radians: number): number {
		return (radians * 180) / Math.PI;
	}
}
