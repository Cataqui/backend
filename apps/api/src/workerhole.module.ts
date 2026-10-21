import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import { connectContainerToWorker } from "@cataqui/workerhole";
import { Global, Inject, Module, type BeforeApplicationShutdown } from "@nestjs/common";

@Global()
@Module({
	providers: [
		{
			provide: ApiWorkerPortal,
			useFactory: async (): Promise<ApiWorkerPortal> => {
				const portal = await connectContainerToWorker(ApiWorkerPortal, {
					expose: { expose: {} },
				});
				// Nest probes provider lifecycle methods; the RPC proxy supplies every method name.
				return {
					getStaticMapLocationUrl: portal.getStaticMapLocationUrl,
					withOptions: portal.withOptions,
					close: portal.close,
				};
			},
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
