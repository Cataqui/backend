import "reflect-metadata";
import { container } from "tsyringe";
import { MapshotApplication } from "./application";
import { LandmarkService } from "./landmark/landmark.service";
import { MapService } from "./map/map.service";
import { EngineAssetsService } from "./renderer/engine-assets.service";
import { RendererProcessRepository } from "./renderer/renderer-process.repository";
import { RendererService } from "./renderer/renderer.service";
import { MapshotWorkerContainerPortal } from "./worker-container-portal";
import { MapSourceService } from "./source/map-source.service";
import { TileResourceService } from "./tiles/tile-resource.service";
import { TileService } from "./tiles/tile.service";

export function createMapshotApplication(): {
	application: MapshotApplication;
	workerContainerPortal: MapshotWorkerContainerPortal;
} {
	const scope = container.createChildContainer();
	scope.registerSingleton(MapshotApplication);
	scope.registerSingleton(MapService);
	scope.registerSingleton(LandmarkService);
	scope.registerSingleton(MapSourceService);
	scope.registerSingleton(TileResourceService);
	scope.registerSingleton(TileService);
	scope.registerSingleton(EngineAssetsService);
	scope.registerSingleton(RendererService);
	scope.registerSingleton(RendererProcessRepository);
	scope.registerSingleton(MapshotWorkerContainerPortal);

	return {
		application: scope.resolve(MapshotApplication),
		workerContainerPortal: scope.resolve(MapshotWorkerContainerPortal),
	};
}
