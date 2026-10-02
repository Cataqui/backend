import app, { MapsEntrypoint } from "./app";
import { StaticService } from "./modules/static/static.service";
vi.mock("./modules/static/static.service");
it.each(["GET", "HEAD"])("keeps %s health checks public", async (method) => {
	expect((await app.request("https://example.com/v1/health", { method: method })).status).toBe(204);
});
it.each(["/v1/images", "/", "/internal/generate"])("does not expose public image generation at %s", async (path) => {
	expect((await app.request(`https://example.com${path}`)).status).toBe(404);
});
it("does not allow POST health requests", async () => {
	expect((await app.request("https://example.com/v1/health", { method: "POST" })).status).toBe(404);
});
it("delegates the private entrypoint with only coordinates", async () => {
	vi.mocked(StaticService.prototype.generate).mockResolvedValue({
		kind: "failed",
		code: "PROVIDER_TIMEOUT",
		retryable: true,
	});
	const entrypoint = new MapsEntrypoint({} as ExecutionContext, { ENVIRONMENT: "development" } as MapsWorkerEnv);
	expect(await entrypoint.generateStaticMaps({ latitude: 0, longitude: 0 })).toEqual({
		kind: "failed",
		code: "PROVIDER_TIMEOUT",
		retryable: true,
	});
});

it("rejects invalid coordinates at the private ingress", async () => {
	const entrypoint = new MapsEntrypoint({} as ExecutionContext, {} as MapsWorkerEnv);
	expect(await entrypoint.generateStaticMaps({ latitude: 91, longitude: 0 })).toMatchObject({
		kind: "failed",
		code: "INVALID_INPUT",
		retryable: false,
	});
});

it("reports every invalid coordinate field without returning submitted values", async () => {
	const entrypoint = new MapsEntrypoint({} as ExecutionContext, {} as MapsWorkerEnv);
	const result = await entrypoint.generateStaticMaps({ latitude: 91, longitude: 181 });
	expect(result.kind === "failed" ? result.violations : undefined).toEqual([
		{ path: "latitude", message: expect.any(String) },
		{ path: "longitude", message: expect.any(String) },
	]);
});
