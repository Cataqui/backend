import type { MapsWorkerEnv } from "../cloudflare.config.ts";
import { container, type DependencyContainer } from "tsyringe";
import * as td from "testdouble";
import { AuthService } from "./auth/auth.service";
import { registerMapsDependencies } from "./maps-dependencies";
import { PlacesService } from "./places/places.service";
import { PlacesRepository } from "./places/places.repository";
import { PlacesConfig } from "./places/places.config";
import { LocationReferenceService } from "./static/location-reference.service";
import { StaticConfig } from "./static/static.config";
import { StaticSigningKeySchema } from "./static/static-signing-key.schema";
import { StaticService } from "./static/static.service";
import { StaticRepository } from "./static/static.repository";
import { WorkerEntrypoint } from "./rpc/entrypoint";
import app from "./app";

const _scopes: DependencyContainer[] = [];
function _scope(params: { environment?: MapsWorkerEnv } = {}): DependencyContainer {
	const scope = container.createChildContainer();
	_scopes.push(scope);
	registerMapsDependencies({
		container: scope,
		environment: params.environment ?? _environment(),
	});
	return scope;
}
function _environment(): MapsWorkerEnv {
	return Object.assign(td.object<MapsWorkerEnv>(), {
		ENVIRONMENT: "development" as const,
		STATIC_BASE_URL: "http://localhost:8787" as const,
		STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL: "A".repeat(43),
		GOOGLE_PLACES_API_KEY: "local-google-key",
	});
}
afterEach(() => td.reset());
afterEach(async () => {
	await Promise.all(_scopes.splice(0).map((scope) => scope.dispose()));
	vi.restoreAllMocks();
});

it("resolves the owned feature graphs through inferred class dependencies", () => {
	const scope = _scope();
	for (const target of [
		PlacesService,
		PlacesRepository,
		StaticService,
		StaticRepository,
		LocationReferenceService,
		AuthService,
	]) {
		expect(scope.resolve<unknown>(target)).toBeInstanceOf(target);
	}
	const first = scope.resolve(StaticService);
	const second = scope.resolve(StaticService);
	expect(first === second).toBe(false);
});
it("caches feature configuration and validates the signing key lazily once per invocation", () => {
	const signingKeyParse = vi.spyOn(StaticSigningKeySchema, "parse");
	const scope = _scope();
	expect(signingKeyParse).not.toHaveBeenCalled();
	scope.resolve(PlacesService);
	expect(signingKeyParse).not.toHaveBeenCalled();
	const config = scope.resolve<StaticConfig>(StaticConfig);
	scope.resolve(LocationReferenceService);
	expect(scope.resolve<StaticConfig>(StaticConfig)).toBe(config);
	expect(signingKeyParse).toHaveBeenCalledTimes(1);
	expect(scope.resolve<PlacesConfig>(PlacesConfig)).toBe(scope.resolve<PlacesConfig>(PlacesConfig));
});
it("keeps Places independent from static signing configuration and signing independent from Places configuration", async () => {
	const placesEnvironment = _environment();
	placesEnvironment.STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL = "";
	const placesScope = _scope({ environment: placesEnvironment });
	expect(placesScope.resolve(PlacesService)).toBeInstanceOf(PlacesService);
	expect(() => placesScope.resolve(LocationReferenceService)).toThrow();
	const staticEnvironment = _environment();
	staticEnvironment.GOOGLE_PLACES_API_KEY = "";
	const staticScope = _scope({ environment: staticEnvironment });
	await expect(
		staticScope.resolve(LocationReferenceService).createUrl({ latitude: 0, longitude: 0 }),
	).resolves.toMatchObject({ url: expect.stringContaining("http://localhost:8787/static/v1/") });
});
it("isolates configuration and Auth bindings between overlapping invocations", async () => {
	const firstEnvironment = _environment();
	const secondEnvironment = _environment();
	secondEnvironment.GOOGLE_PLACES_API_KEY = "second-key";
	secondEnvironment.STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL = "B".repeat(42) + "A";
	const first = _scope({ environment: firstEnvironment });
	const second = _scope({ environment: secondEnvironment });
	const firstSession = {
		accountId: "first-account",
		sessionId: "first-session",
		expiresAt: "2026-10-20T12:00:00.000Z",
		[Symbol.dispose]: td.func<Disposable[typeof Symbol.dispose]>(),
	} satisfies NonNullable<Awaited<ReturnType<MapsWorkerEnv["AUTH"]["resolveSession"]>>>;
	const secondSession = {
		accountId: "second-account",
		sessionId: "second-session",
		expiresAt: "2026-10-20T12:00:00.000Z",
		[Symbol.dispose]: td.func<Disposable[typeof Symbol.dispose]>(),
	} satisfies NonNullable<Awaited<ReturnType<MapsWorkerEnv["AUTH"]["resolveSession"]>>>;
	td.when(firstEnvironment.AUTH.resolveSession({ accessToken: "first" })).thenResolve(firstSession);
	td.when(secondEnvironment.AUTH.resolveSession({ accessToken: "second" })).thenResolve(secondSession);
	await expect(
		Promise.all([
			first.resolve(AuthService).getAuthenticatedAccountIdOrNull({ accessToken: "first" }),
			second.resolve(AuthService).getAuthenticatedAccountIdOrNull({ accessToken: "second" }),
		]),
	).resolves.toEqual(["first-account", "second-account"]);
	expect(first.resolve<PlacesConfig>(PlacesConfig).googlePlacesApiKey).toBe("local-google-key");
	expect(second.resolve<PlacesConfig>(PlacesConfig).googlePlacesApiKey).toBe("second-key");
	expect(first.resolve<StaticConfig>(StaticConfig).signingKey).toBe(
		firstEnvironment.STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL,
	);
	expect(second.resolve<StaticConfig>(StaticConfig).signingKey).toBe(
		secondEnvironment.STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL,
	);
	expect(first.resolve<PlacesConfig>(PlacesConfig)).not.toBe(second.resolve<PlacesConfig>(PlacesConfig));
	expect(first.resolve<StaticConfig>(StaticConfig)).not.toBe(second.resolve<StaticConfig>(StaticConfig));
	td.verify(firstSession[Symbol.dispose](), { times: 1 });
	td.verify(secondSession[Symbol.dispose](), { times: 1 });
});
it.each(["/v1/health", "/openapi.json"])("serves %s without resolving unused configuration", async (path) => {
	const environment = _environment();
	environment.STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL = "";
	environment.GOOGLE_PLACES_API_KEY = "";
	const response = await app.fetch(
		new Request(`https://maps.cataqui.com${path}`),
		environment,
		td.object<ExecutionContext>(),
	);
	expect(response.status).toBe(path === "/v1/health" ? 204 : 200);
});
it("disposes the HTTP child container after a successful or failed request", async () => {
	const original = container.createChildContainer.bind(container);
	const scopes: DependencyContainer[] = [];
	td.replace(container, "createChildContainer");
	td.when(container.createChildContainer()).thenDo((): DependencyContainer => {
		const scope = original();
		scopes.push(scope);
		vi.spyOn(scope, "dispose");
		return scope;
	});
	const environment = _environment();
	environment.STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL = "";
	const results = await Promise.all([
		app.fetch(new Request("https://maps.cataqui.com/v1/health"), environment, td.object<ExecutionContext>()),
		app.fetch(
			new Request("https://maps.cataqui.com/static/v1/reference.webp?size=480x480"),
			environment,
			td.object<ExecutionContext>(),
		),
	]);
	expect(results.map((response) => response.status)).toEqual([204, 500]);
	for (const scope of scopes) expect(scope.dispose).toHaveBeenCalledOnce();
});
it("uses and disposes independent RPC containers for successful and failed signing", async () => {
	const original = container.createChildContainer.bind(container);
	const scopes: DependencyContainer[] = [];
	td.replace(container, "createChildContainer");
	td.when(container.createChildContainer()).thenDo((): DependencyContainer => {
		const scope = original();
		scopes.push(scope);
		vi.spyOn(scope, "dispose");
		return scope;
	});
	const environment = _environment();
	await expect(
		new WorkerEntrypoint(td.object<ExecutionContext>(), environment).getStaticMapLocationUrl({
			latitude: 0,
			longitude: 0,
		}),
	).resolves.toMatchObject({ url: expect.stringContaining("/static/v1/") });
	environment.STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL = "";
	await expect(
		new WorkerEntrypoint(td.object<ExecutionContext>(), environment).getStaticMapLocationUrl({
			latitude: 0,
			longitude: 0,
		}),
	).rejects.toMatchObject({ errorCode: "INTERNAL_ERROR" });
	expect(scopes).toHaveLength(2);
	expect(scopes[0]).not.toBe(scopes[1]);
	for (const scope of scopes) expect(scope.dispose).toHaveBeenCalledOnce();
});
