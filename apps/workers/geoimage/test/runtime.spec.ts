import { getImagePermissionJwks, permissionHeadersForUrl } from "./image-permission";
import { createExecutionContext, evictDurableObject, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import app from "../src/app";
import { getImageIdentity } from "../src/images/image-identity";

const _jpeg = new Uint8Array([255, 216, 255, 217]);
const _query = "latitude=0&longitude=0&size=480x480&density=1";
const _provider = vi.fn(async (request: RequestInfo | URL) => {
	expect(new URL(request instanceof Request ? request.url : String(request)).origin).toBe("https://maps.geoapify.com");
	await new Promise((resolve) => setTimeout(resolve, 20));
	return new Response(_jpeg, { headers: { "Content-Type": "image/jpeg" } });
});

beforeEach(() => {
	_provider.mockClear();
	vi.stubGlobal("fetch", async (request: RequestInfo | URL) => {
		const url = new URL(request instanceof Request ? request.url : String(request));
		if (url.pathname.endsWith("/jwks")) return Response.json(await getImagePermissionJwks());
		return _provider(request);
	});
});
afterEach(() => vi.unstubAllGlobals());

it("coalesces cold GETs through real RPC and reuses R2 after eviction without a provider key", async () => {
	const contexts = Array.from({ length: 5 }, () => createExecutionContext());
	const responses = await Promise.all(
		contexts.map(async (context, index) =>
			app.fetch(
				new Request(`https://geoimage.test/v1/images?${_query}`, {
					headers: {
						...(await permissionHeadersForUrl(`https://geoimage.test/v1/images?${_query}`)),
						"x-request-id": `runtime-${index}`,
					},
				}),
				env,
				context,
			),
		),
	);
	expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
	for (const response of responses) {
		expect(response.headers.get("x-request-id")).toBeNull();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(_jpeg);
	}
	await Promise.all(contexts.map((context) => waitOnExecutionContext(context)));
	expect(_provider).toHaveBeenCalledTimes(1);
	const objects = await env.IMAGES.list();
	expect(objects.objects).toHaveLength(1);
	expect(new Uint8Array(await (await env.IMAGES.get(objects.objects[0]!.key))!.arrayBuffer())).toEqual(_jpeg);

	const key = await getImageIdentity({
		input: { latitude: 0, longitude: 0, map: { size: { width: 480, height: 480 }, density: 1 } },
		environment: env.ENVIRONMENT,
	});
	await evictDurableObject(env.GENERATION.getByName(key));
	const context = createExecutionContext();
	const response = await app.fetch(
		new Request(`https://geoimage.test/v1/images?${_query}`, {
			headers: await permissionHeadersForUrl(`https://geoimage.test/v1/images?${_query}`),
		}),
		{ ...env, GEOAPIFY_API_KEY: "" },
		context,
	);
	expect(response.status).toBe(200);
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(_jpeg);
	await waitOnExecutionContext(context);
	expect(_provider).toHaveBeenCalledTimes(1);
}, 30000);

it("generates and persists a cold HEAD without returning image bytes", async () => {
	const context = createExecutionContext();
	const response = await app.fetch(
		new Request("https://geoimage.test/v1/images?latitude=1&longitude=1&size=480x480", {
			method: "HEAD",
			headers: await permissionHeadersForUrl("https://geoimage.test/v1/images?latitude=1&longitude=1&size=480x480"),
		}),
		env,
		context,
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("Content-Type")).toBe("image/jpeg");
	expect(await response.text()).toBe("");
	await waitOnExecutionContext(context);
	expect(_provider).toHaveBeenCalledTimes(1);
});
