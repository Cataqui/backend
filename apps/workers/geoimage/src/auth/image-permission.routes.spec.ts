import app from "../app";
import { createTestBindings, Jpeg, Query } from "../../test/fakes";
import { createImagePermission, getImagePermissionJwks } from "../../test/image-permission";
import { AuthService, authService } from "./auth.service";

let _bindings: ReturnType<typeof createTestBindings>;
let _token: string;
const _jwks = vi.fn<typeof fetch>();
const _provider = vi.fn<typeof fetch>();
beforeEach(async () => {
	_bindings = createTestBindings();
	_token = await createImagePermission({ latitude: -23.5505, longitude: -46.6333 });
	const fresh = new AuthService();
	vi.spyOn(authService, "authorizeImage").mockImplementation((params) => fresh.authorizeImage(params));
	_jwks.mockReset().mockImplementation(async () => Response.json(await getImagePermissionJwks()));
	_provider
		.mockReset()
		.mockImplementation(async () => new Response(Jpeg, { headers: { "Content-Type": "image/jpeg" } }));
	vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) => {
		if (String(url).includes("/jwks")) return _jwks(url, init);
		return _provider(url, init);
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
function _request(params: { token?: string; query?: string; method?: string } = {}) {
	return app.request(
		`/v1/images?${params.query ?? Query}`,
		{
			method: params.method ?? "GET",
			headers: {
				"x-request-id": "permission-check",
				...(params.token === undefined ? {} : { Authorization: `Bearer ${params.token}` }),
			},
		},
		_bindings.env,
		_bindings.execution,
	);
}
it.each(["GET", "HEAD"])("rejects missing %s permission before JWKS, storage, or generation", async (method) => {
	const response = await _request({ method: method });
	expect(response.status).toBe(401);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("x-request-id")).toBe("permission-check");
	if (method === "GET") expect(await response.json()).toEqual({ errorCode: "UNAUTHORIZED" });
	else expect(await response.text()).toBe("");
	expect(_bindings.get).not.toHaveBeenCalled();
	expect(_bindings.generate).not.toHaveBeenCalled();
	expect(_jwks).not.toHaveBeenCalled();
	expect(_provider).not.toHaveBeenCalled();
});
it("validates query parameters before key retrieval even with permission", async () => {
	const response = await _request({ token: _token, query: "latitude=999" });
	expect(response.status).toBe(400);
	expect(_jwks).not.toHaveBeenCalled();
	expect(_bindings.get).not.toHaveBeenCalled();
});
it("rejects changed coordinates without accessing even an existing stored image", async () => {
	const response = await _request({ token: _token, query: Query.replace("latitude=-23.5505", "latitude=-23.5506") });
	expect(response.status).toBe(403);
	expect(await response.json()).toEqual({ errorCode: "FORBIDDEN" });
	expect(_bindings.get).not.toHaveBeenCalled();
	expect(_provider).not.toHaveBeenCalled();
});
it("delivers a shared cache-ready image for two distinct tokens and equivalent coordinates", async () => {
	const first = await _request({ token: _token });
	expect(first.status).toBe(200);
	expect(new Uint8Array(await first.arrayBuffer())).toEqual(Jpeg);
	const second = await _request({
		token: await createImagePermission({ latitude: -23.5505, longitude: -46.6333 }),
		query: Query.replace("-23.5505", "-23.550500"),
	});
	expect(second.status).toBe(200);
	await second.arrayBuffer();
	expect(second.headers.get("Vary")).toBeNull();
	expect(second.headers.get("x-request-id")).toBeNull();
	expect(second.headers.get("Cache-Control")).toBe("public, max-age=86400, s-maxage=31536000");
	expect(_provider).toHaveBeenCalledTimes(1);
	expect(_jwks).toHaveBeenCalledTimes(1);
	expect(_bindings.objects.size).toBe(1);
	const denied = await _request();
	expect(denied.status).toBe(401);
	expect(_bindings.get).toHaveBeenCalledTimes(3);
});
it("reports JWKS unavailability without private details or image operations", async () => {
	_jwks.mockRejectedValue(new Error("private endpoint and key details"));
	const response = await _request({ token: _token });
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({ errorCode: "AUTH_UNAVAILABLE" });
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(_bindings.get).not.toHaveBeenCalled();
	expect(_provider).not.toHaveBeenCalled();
});
