import { ContainerNotReadyError } from "./health/errors/container-not-ready.error";
import type { MapshotWorkerContainerPortal as MapshotWorkerContainerPortalDefinition } from "@cataqui/mapshot-workerhole";
import type { Handlers } from "@cataqui/workerhole";
import { injectable } from "tsyringe";
import { MapshotApplication } from "./application";

import { MapService } from "./map/map.service";

@injectable()
export class MapshotWorkerContainerPortal {
	readonly expose: Handlers<typeof MapshotWorkerContainerPortalDefinition>;

	constructor(application: MapshotApplication, mapService: MapService) {
		this.expose = {
			render: async (input, context): ReturnType<MapshotWorkerContainerPortalDefinition["render"]> => {
				if (!application.ready) throw new ContainerNotReadyError();

				const result = await mapService.render({
					input: input,
					signal: AbortSignal.any([context.signal, application.signal]),
				});
				return {
					bytes: new Blob([result.bytes]).stream(),
					metadata: result.metadata,
				};
			},
		};
	}
}
