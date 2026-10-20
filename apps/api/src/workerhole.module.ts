import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import { connectContainerToWorker } from "@cataqui/workerhole";
import { Global, Inject, Module, type BeforeApplicationShutdown } from "@nestjs/common";

@Global()
@Module({
	providers: [
		{
			provide: ApiWorkerPortal,
			useFactory: async (): Promise<ApiWorkerPortal> =>
				connectContainerToWorker(ApiWorkerPortal, {
					expose: { expose: {} },
				}),
		},
	],
	exports: [ApiWorkerPortal],
})
export class WorkerholeModule implements BeforeApplicationShutdown {
	constructor(@Inject(ApiWorkerPortal) private readonly _workerPortal: ApiWorkerPortal) {}

	async beforeApplicationShutdown(): Promise<void> {
		await this._workerPortal.close();
	}
}
