export interface IMapsHonoEnvironment {
	Bindings: MapsWorkerEnv;
	Variables: { authenticatedUserId: string; requestId: string };
}
