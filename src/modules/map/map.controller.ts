import { Controller, Post, Body, Version, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { MapService } from "./map.service";
import { MapAuthenticateRequestDto } from "./dto/map-authenticate-request.dto";
import { MapAuthOutputDto } from "./dto/map-auth-output.dto";
import { ApiAuthenticateMapDocs } from "./decorators/api-authenticate-map-docs.decorator";

@ApiTags("map")
@Controller("map")
export class MapController {
	constructor(private readonly _mapService: MapService) {}

	@Post("authenticate")
	@Version("1")
	@HttpCode(HttpStatus.OK)
	@ApiAuthenticateMapDocs()
	async authenticate(@Body() dto: MapAuthenticateRequestDto): Promise<MapAuthOutputDto> {
		return this._mapService.authenticate({ region: dto.region });
	}
}
