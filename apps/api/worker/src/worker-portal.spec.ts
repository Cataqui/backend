import type { ApiWorkerEnv } from "../cloudflare.config.ts";
import * as td from "testdouble";
import { ApiWorkerPortal } from "./worker-portal";

afterEach(() => td.reset());

it("calls Maps through the native binding using only the selected capability", async () => {
	const maps = td.object<ApiWorkerEnv["MAPS"]>();
	const result = {
		url: "https://example.com/map",
		[Symbol.dispose]: td.func<() => void>(),
	} satisfies Awaited<ReturnType<ApiWorkerEnv["MAPS"]["getStaticMapLocationUrl"]>>;
	td.when(maps.getStaticMapLocationUrl(td.matchers.anything())).thenDo(
		async (): Promise<Awaited<ReturnType<ApiWorkerEnv["MAPS"]["getStaticMapLocationUrl"]>>> => result,
	);
	const environment = Object.assign(td.object<ApiWorkerEnv>(), { MAPS: maps });
	const portal = new ApiWorkerPortal(td.object<ConstructorParameters<typeof ApiWorkerPortal>[0]>(), environment);
	const output = await portal.expose.getStaticMapLocationUrl(
		{ latitude: -23.5, longitude: -46.6 },
		{ signal: new AbortController().signal },
	);
	expect(output).toEqual({ url: result.url });
	td.verify(maps.getStaticMapLocationUrl({ latitude: -23.5, longitude: -46.6 }));
});

it("propagates a Maps rejection through the API bridge", async () => {
	const maps = td.object<ApiWorkerEnv["MAPS"]>();
	const failure = new Error("Static map URL generation failed.");
	td.when(maps.getStaticMapLocationUrl(td.matchers.anything())).thenReject(failure);
	const environment = Object.assign(td.object<ApiWorkerEnv>(), { MAPS: maps });
	const portal = new ApiWorkerPortal(td.object<ConstructorParameters<typeof ApiWorkerPortal>[0]>(), environment);
	await expect(
		portal.expose.getStaticMapLocationUrl(
			{ latitude: -23.5, longitude: -46.6 },
			{ signal: new AbortController().signal },
		),
	).rejects.toBe(failure);
});
