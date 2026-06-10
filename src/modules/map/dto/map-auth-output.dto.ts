import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class MapAuthOutputDto {
	@Expose({ name: "query_params" })
	@ApiProperty({
		name: "query_params",
		description: "Query parameters to append to map tile URLs for authentication",
		example: "v=1&sig=e2a3b4c5d6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3",
	})
	readonly queryParams: string;

	@Expose({ name: "expires_at" })
	@ApiProperty({
		name: "expires_at",
		description: "ISO 8601 timestamp when the auth credentials expire",
		example: "2026-06-10T12:00:00.000Z",
	})
	readonly expiresAt: string;

	@Expose({ name: "map_version" })
	@ApiProperty({
		name: "map_version",
		description: "Map version identifier for the requested region",
		example: "2026-06-09",
	})
	readonly mapVersion: string;

	@Expose({ name: "tiles_url_template" })
	@ApiProperty({
		name: "tiles_url_template",
		description: "URL template for map tiles. Replace {z}/{x}/{y} with tile coordinates to request specific tiles",
		example: "https://tiles.cataqui.com/br/br/{z}/{x}/{y}.mvt",
	})
	readonly tilesUrlTemplate: string;

	constructor(params: { queryParams: string; expiresAt: string; mapVersion: string; tilesUrlTemplate: string }) {
		this.queryParams = params.queryParams;
		this.expiresAt = params.expiresAt;
		this.mapVersion = params.mapVersion;
		this.tilesUrlTemplate = params.tilesUrlTemplate;
	}
}
