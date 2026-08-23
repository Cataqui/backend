export interface IGeosearchHonoEnvironment {
	Bindings: GeosearchWorkerEnv;
	Variables: { authenticatedUserId: string; requestId: string };
}
