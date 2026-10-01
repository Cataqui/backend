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
		MICROSERVICES_AUTH_JWKS_URL: "http://localhost:3000/v1/auth/microservices/jwks",
	};
	const execution = {
		waitUntil: vi.fn(),
		passThroughOnException: () => {},
	} as unknown as ExecutionContext;
	return {
		env: env,
		objects: objects,
		get: get,
		put: put,
		generate: generate,
		execution: execution,
	};
}
