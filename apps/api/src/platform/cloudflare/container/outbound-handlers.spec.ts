import { OutboundHandlers } from "./outbound-handlers";
const generate = vi.fn();
const service = { generateStaticMaps: generate, fetch: vi.fn(), connect: vi.fn() };
const environment: Pick<Cloudflare.Env, "MAPS"> = { MAPS: service };
const env = environment as Cloudflare.Env;
const context = { containerId: "container", className: "ApiContainer" };
const target = OutboundHandlers["maps.internal"]!;
beforeEach(() => vi.resetAllMocks());
it("executes the registered coordinate-only RPC", async () => {
	generate.mockResolvedValue({ kind: "failed", code: "PROVIDER_TIMEOUT", retryable: true });
	const response = await target(
		new Request("http://maps.internal/", {
			method: "POST",
			body: JSON.stringify({ method: "generateStaticMaps", input: { latitude: 0, longitude: 0 } }),
		}),
		env,
		context,
	);
	expect(await response.json()).toEqual({ kind: "failed", code: "PROVIDER_TIMEOUT", retryable: true });
});
it.each([new Request("http://maps.internal/"), new Request("http://maps.internal/wrong", { method: "POST" })])(
	"rejects unregistered operations",
	async (request) => {
		expect((await target(request, env, context)).status).toBe(404);
	},
);
it.each(["not json", "x".repeat(4097)])("rejects malformed or excessive outbound input", async (body) => {
	expect(
		(await target(new Request("http://maps.internal/", { method: "POST", body: body }), env, context)).status,
	).toBe(400);
});
it("reports invalid coordinate fields", async () => {
	const response = await target(
		new Request("http://maps.internal/", {
			method: "POST",
			body: JSON.stringify({ method: "generateStaticMaps", input: { latitude: 91, longitude: 0 } }),
		}),
		env,
		context,
	);
	expect(await response.json()).toMatchObject({ violations: [{ path: "latitude" }] });
});
it("sanitizes private binding errors", async () => {
	generate.mockRejectedValue(new Error("private details"));
	expect(
		(
			await target(
				new Request("http://maps.internal/", {
					method: "POST",
					body: JSON.stringify({ method: "generateStaticMaps", input: { latitude: 0, longitude: 0 } }),
				}),
				env,
				context,
			)
		).status,
	).toBe(503);
});

it.each(["unknown", "fetch", "constructor", "toString", "__proto__"])(
	"rejects unregistered method %s without calling a binding",
	async (method) => {
		const response = await target(
			new Request("http://maps.internal/", {
				method: "POST",
				body: JSON.stringify({ method: method, input: { latitude: 0, longitude: 0 } }),
			}),
			env,
			context,
		);
		expect(response.status).toBe(404);
		expect(generate).not.toHaveBeenCalled();
		expect(service.fetch).not.toHaveBeenCalled();
	},
);
it.each([{}, { method: 1, input: {} }, { method: "generateStaticMaps", input: {}, worker: "other" }])(
	"rejects invalid call envelopes %j",
	async (body) => {
		const response = await target(
			new Request("http://maps.internal/", { method: "POST", body: JSON.stringify(body) }),
			env,
			context,
		);
		expect(response.status).toBe(400);
		expect(generate).not.toHaveBeenCalled();
	},
);
it("rejects invalid binding results without exposing their contents", async () => {
	generate.mockResolvedValue({ private: "provider details" });
	const response = await target(
		new Request("http://maps.internal/", {
			method: "POST",
			body: JSON.stringify({ method: "generateStaticMaps", input: { latitude: 0, longitude: 0 } }),
		}),
		env,
		context,
	);
	expect([response.status, await response.text()]).toEqual([503, ""]);
});
