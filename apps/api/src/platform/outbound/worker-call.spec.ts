import { workerCall } from "./worker-call";
const input = { latitude: -23, longitude: -46 };
const result = { kind: "failed", code: "PROVIDER_TIMEOUT", retryable: true };
afterEach(() => vi.unstubAllGlobals());
it("serializes coordinates to the registered outbound host", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
	await workerCall({ worker: "maps", method: "generateStaticMaps", input: input });
	expect(fetch).toHaveBeenCalledExactlyOnceWith(
		"http://maps.internal/",
		expect.objectContaining({
			method: "POST",
			body: JSON.stringify({ method: "generateStaticMaps", input: input }),
			redirect: "error",
		}),
	);
});
it("validates and returns the generation outcome", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
	expect(
		await workerCall({
			worker: "maps",
			method: "generateStaticMaps",
			input: input,
			signal: new AbortController().signal,
		}),
	).toEqual(result);
});
it.each([new Response("error", { status: 503 }), new Response(null, { status: 503 })])(
	"sanitizes outbound transport failures",
	async (response) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
		await expect(workerCall({ worker: "maps", method: "generateStaticMaps", input: input })).rejects.toThrow(
			"Worker call unavailable",
		);
	},
);
it("rejects invalid output from an outbound target", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ kind: "ready", images: [] })));
	await expect(workerCall({ worker: "maps", method: "generateStaticMaps", input: input })).rejects.toThrow();
});

it("infers the result from the selected Worker method", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
	const pending = workerCall({ worker: "maps", method: "generateStaticMaps", input: input });
	expectTypeOf(pending).toEqualTypeOf<Promise<import("@cataqui/maps-contracts").GenerateStaticMapsResult>>();
	await pending;
});
it("rejects incorrect method inputs before sending a request", async () => {
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	await expect(
		// @ts-expect-error The selected method requires numeric latitude and longitude.
		workerCall({ worker: "maps", method: "generateStaticMaps", input: { latitude: "0", longitude: 0 } }),
	).rejects.toThrow();
	expect(fetch).not.toHaveBeenCalled();
});
it("rejects unknown methods before sending a request", async () => {
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	// @ts-expect-error Worker methods must come from the explicit registry.
	await expect(workerCall({ worker: "maps", method: "fetch", input: input })).rejects.toThrow(
		"Worker method unavailable",
	);
	expect(fetch).not.toHaveBeenCalled();
});
it("rejects unexpected input fields instead of widening the selected method", async () => {
	vi.stubGlobal("fetch", vi.fn());
	await expect(
		// @ts-expect-error Rendering settings are not part of the generation method input.
		workerCall({ worker: "maps", method: "generateStaticMaps", input: { ...input, zoom: 13 } }),
	).rejects.toThrow();
	expect(fetch).not.toHaveBeenCalled();
});
it("preserves the caller cancellation signal", async () => {
	const signal = new AbortController().signal;
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
	await workerCall({ worker: "maps", method: "generateStaticMaps", input: input, signal: signal });
	expect(fetch).toHaveBeenCalledWith("http://maps.internal/", expect.objectContaining({ signal: signal }));
});

it("rejects unknown Workers before sending a request", async () => {
	vi.stubGlobal("fetch", vi.fn());
	// @ts-expect-error Worker names must come from the explicit registry.
	await expect(workerCall({ worker: "unknown", method: "generateStaticMaps", input: input })).rejects.toThrow(
		"Worker unavailable",
	);
	expect(fetch).not.toHaveBeenCalled();
});
