import { ImageGenerationDurableObject } from "../src/images/image-generation.durable-object";

export const Jpeg = new Uint8Array([255, 216, 255, 217]);
export const Query = "latitude=-23.5505&longitude=-46.6333&size=480x1280";

export function createTestBindings() {
	const objects = new Map<string, Uint8Array>();
	const get = vi.fn(async (key: string) => {
		const bytes = objects.get(key);
		return bytes === undefined
			? null
			: ({
					body: new Response(bytes.slice().buffer).body!,
					size: bytes.length,
					httpEtag: '"stored-etag"',
				} as R2ObjectBody);
	});
	const put = vi.fn(async (key: string, value: Uint8Array, _options: R2PutOptions) => {
		objects.set(key, value.slice());
		return { httpEtag: '"stored-etag"' } as R2Object;
	});
	const bucket = { get: get, put: put } as unknown as R2Bucket;
	const cached = new Map<string, Response>();
	const match = vi.fn(async (key: Request) => cached.get(key.url)?.clone());
	const cachePut = vi.fn(async (key: Request, response: Response) => {
		// Materialize like the edge cache, rather than leaving an unread tee branch in tests.
		cached.set(key.url, new Response(await response.arrayBuffer(), response));
	});
	const cache = { match: match, put: cachePut } as unknown as Cache;
	const coordinators = new Map<string, ImageGenerationDurableObject>();
	const generate = vi.fn(async (name: string, params: Parameters<ImageGenerationDurableObject["generate"]>[0]) => {
		let coordinator = coordinators.get(name);
		if (coordinator === undefined) {
			coordinator = new ImageGenerationDurableObject({} as DurableObjectState, env);
			coordinators.set(name, coordinator);
		}
		return coordinator.generate(params);
	});
	const namespace = {
		getByName: (name: string) => ({
			generate: (params: Parameters<ImageGenerationDurableObject["generate"]>[0]) => generate(name, params),
		}),
	} as unknown as GeoimageWorkerEnv["GENERATION"];
	const env: GeoimageWorkerEnv = {
		IMAGES: bucket,
		GENERATION: namespace,
		GEOAPIFY_API_KEY: "test-secret",
		ENVIRONMENT: "development",
	};
	const tasks: Promise<unknown>[] = [];
	const execution = {
		waitUntil: (promise: Promise<unknown>) => {
			tasks.push(promise);
		},
		passThroughOnException: () => {},
	} as unknown as ExecutionContext;
	return {
		env: env,
		cache: cache,
		objects: objects,
		cached: cached,
		get: get,
		put: put,
		match: match,
		cachePut: cachePut,
		generate: generate,
		execution: execution,
		tasks: tasks,
	};
}
