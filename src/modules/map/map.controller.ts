import { Controller, Get, Query, Version, Header } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { MapService } from "./map.service";
import { MapConfigRequestQueryDto } from "./dto/map-config-request-query.dto";
import { MapConfigOutputDto } from "./dto/map-config-output.dto";
import { ApiMapConfigDocs } from "./decorators/api-map-config-docs.decorator";
import { MapAuthConstants } from "./map-auth.constants";

@ApiTags("map")
@Controller("map")
export class MapController {
	constructor(private readonly _mapService: MapService) {}

	@Get("config")
	@Version("1")
	@Header("Cache-Control", `public, max-age=${MapAuthConstants.AUTH_EXPIRATION_SECONDS}`)
	@ApiMapConfigDocs()
	async getConfig(@Query() query: MapConfigRequestQueryDto): Promise<MapConfigOutputDto> {
		return this._mapService.getConfig({ region: query.region });
	}
}
