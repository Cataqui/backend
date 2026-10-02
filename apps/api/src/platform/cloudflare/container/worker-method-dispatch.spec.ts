import { OutboundHandlers } from "./outbound-handlers";

vi.mock("../../outbound/worker-manifest", async () => {
	const { z } = await import("zod");
	const { defineWorkerMethod } = await import("../../outbound/define-worker-method");
	// Test-only registry exercises dispatch without adding operations to production bindings.
	return {
		WorkerManifest: {
			maps: {
				host: "maps.internal",
				methods: {
					length: defineWorkerMethod({
						input: z.string(),
						result: z.number(),
						execute: async ({ input }) => input.length,
					}),
					negate: defineWorkerMethod({ input: z.boolean(), result: z.boolean(), execute: async ({ input }) => !input }),
				},
			},
			anotherWorker: {
				host: "another.internal",
				methods: {
					length: defineWorkerMethod({
						input: z.array(z.number()),
						result: z.number(),
						execute: async ({ input }) => input.reduce((sum, value) => sum + value, 0),
					}),
				},
			},
		},
	};
});

it.each([
	{ host: "maps.internal", method: "length", input: "hello", result: 5 },
	{ host: "maps.internal", method: "negate", input: true, result: false },
	{ host: "another.internal", method: "length", input: [2, 4], result: 6 },
])("dispatches $host.$method with its own contract", async ({ host, method, input, result }) => {
	const response = await OutboundHandlers[host]!(
		new Request(`http://${host}/`, { method: "POST", body: JSON.stringify({ method: method, input: input }) }),
		{} as Cloudflare.Env,
		{ containerId: "test", className: "ApiContainer" },
	);
	expect([response.status, await response.json()]).toEqual([200, result]);
});
it("does not accept another Worker's method on the selected host", async () => {
	const response = await OutboundHandlers["another.internal"]!(
		new Request("http://another.internal/", {
			method: "POST",
			body: JSON.stringify({ method: "negate", input: true }),
		}),
		{} as Cloudflare.Env,
		{ containerId: "test", className: "ApiContainer" },
	);
	expect(response.status).toBe(404);
});
it("validates the selected method instead of a union of all registered inputs", async () => {
	const response = await OutboundHandlers["maps.internal"]!(
		new Request("http://maps.internal/", { method: "POST", body: JSON.stringify({ method: "length", input: true }) }),
		{} as Cloudflare.Env,
		{ containerId: "test", className: "ApiContainer" },
	);
	expect(response.status).toBe(400);
});
