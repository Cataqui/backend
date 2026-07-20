import { Module } from "@nestjs/common";
import { MapController } from "./map.controller";
import { MapService } from "./map.service";
import { MapVersionRepository } from "./repositories/map-version.repository";

@Module({
	controllers: [MapController],
	providers: [MapService, MapVersionRepository],
	exports: [MapService],
})
export class MapModule {}
