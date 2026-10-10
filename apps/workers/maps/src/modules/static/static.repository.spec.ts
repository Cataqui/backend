import { StaticStyle } from "./static-style";
import { StaticRepository } from "./static.repository";

const Png = new Uint8Array([137, 80, 78, 71]);
const head = vi.fn();
const put = vi.fn();
const get = vi.fn();
const info = vi.fn();
const output = vi.fn();
const transformer: ImageTransformer = { transform: vi.fn(), draw: vi.fn(), output: output };
const input = vi.fn<(stream: ReadableStream<Uint8Array>) => ImageTransformer>(() => transformer);
const bucket = { head: head, put: put, get: get };
let repository: StaticRepository;
beforeEach(() => {
	vi.resetAllMocks();
	input.mockReturnValue(transformer);
	head.mockResolvedValue(null);
	put.mockResolvedValue({});
	info.mockResolvedValue({ format: "image/webp", width: 960, height: 2560, fileSize: 100 });
	output.mockResolvedValue({ image: () => new Response(new Uint8Array([1, 2])).body });
	repository = new StaticRepository({
		bucket: bucket,
		images: { input: input, info: info },
		generation: { getByName: vi.fn() },
		staticConfig: { geoapifyApiKey: "test-key", environment: "development", baseUrl: "https://maps.test" },
	});
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/webp" } })),
	);
});
afterEach(() => vi.unstubAllGlobals());

describe("finished WebP storage", () => {
	it("reports a missing R2 image", async () => {
		expect(await repository.findImage({ key: "static/image.webp" })).toBe(false);
	});
	it("reuses an existing R2 object", async () => {
		head.mockResolvedValue({ size: 100 });
		expect(await repository.findImage({ key: "static/image.webp" })).toBe(true);
	});
	it("sanitizes R2 lookup failures", async () => {
		head.mockRejectedValue(new Error("private storage details"));
		await expect(repository.findImage({ key: "static/image.webp" })).rejects.toMatchObject({
			errorCode: "STORAGE_UNAVAILABLE",
		});
	});
	it("stores encoded WebP bytes with immutable representation metadata", async () => {
		await repository.upload({
			key: "static/image.webp",
			bytes: new Uint8Array([1, 2]),
			width: 960,
			height: 2560,
			revision: "v1",
		});
		expect(put).toHaveBeenCalledWith("static/image.webp", new Uint8Array([1, 2]), {
			httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
			customMetadata: { width: "960", height: "2560", revision: "v1" },
		});
	});
	it("recovers an R2 write that completed before its response failed", async () => {
		put.mockRejectedValue(new Error("timeout"));
		head.mockResolvedValue({ size: 100 });
		await expect(
			repository.upload({
				key: "static/image.webp",
				bytes: new Uint8Array([1]),
				width: 960,
				height: 2560,
				revision: "v1",
			}),
		).resolves.toBeUndefined();
	});
	it("rejects a failed write when no object exists", async () => {
		put.mockRejectedValue(new Error("timeout"));
		await expect(
			repository.upload({
				key: "static/image.webp",
				bytes: new Uint8Array([1]),
				width: 960,
				height: 2560,
				revision: "v1",
			}),
		).rejects.toMatchObject({ errorCode: "STORAGE_UNAVAILABLE" });
	});
	it("does not look up an ambiguous write after cancellation", async () => {
		const controller = new AbortController();
		put.mockImplementation(async () => {
			controller.abort();
			throw new Error("late failure");
		});
		await expect(
			repository.upload({
				key: "static/image.webp",
				bytes: new Uint8Array([1]),
				width: 960,
				height: 2560,
				revision: "v1",
				signal: controller.signal,
			}),
		).rejects.toBeInstanceOf(DOMException);
		expect(head).not.toHaveBeenCalled();
	});
});
describe("WebP encoding", () => {
	it("uses the Images binding with explicit WebP quality", async () => {
		await repository.encode({ bytes: new Uint8Array([1]), width: 960, height: 2560 });
		expect(output).toHaveBeenCalledWith({ format: "image/webp", quality: 80 });
	});
	it("passes only the bytes in a sliced view to the encoder", async () => {
		await repository.encode({ bytes: new Uint8Array([0, 1, 2, 3]).subarray(1, 3), width: 960, height: 2560 });
		expect(new Uint8Array(await new Response(input.mock.calls[0]?.[0]).arrayBuffer())).toEqual(new Uint8Array([1, 2]));
	});
	it("returns the finished WebP bytes", async () => {
		expect(await repository.encode({ bytes: new Uint8Array([1]), width: 960, height: 2560 })).toEqual(
			new Uint8Array([1, 2]),
		);
	});
	it.each([
		{ format: "image/png", width: 960, height: 2560 },
		{ format: "image/webp", width: 480, height: 2560 },
		{ format: "image/webp", width: 960, height: 1280 },
	])("rejects an incorrectly encoded representation %j", async (metadata) => {
		info.mockResolvedValue(metadata);
		await expect(repository.encode({ bytes: new Uint8Array([1]), width: 960, height: 2560 })).rejects.toMatchObject({
			errorCode: "TRANSFORMATION_UNAVAILABLE",
			retryable: false,
		});
	});
	it("retries a transient Images failure", async () => {
		output.mockRejectedValue(new Error("temporary failure"));
		await expect(repository.encode({ bytes: new Uint8Array([1]), width: 960, height: 2560 })).rejects.toMatchObject({
			errorCode: "TRANSFORMATION_UNAVAILABLE",
			retryable: true,
		});
	});
	it("does not retry input that Images cannot decode", async () => {
		output.mockRejectedValue({ code: 9412 });
		await expect(repository.encode({ bytes: new Uint8Array([1]), width: 960, height: 2560 })).rejects.toMatchObject({
			errorCode: "TRANSFORMATION_UNAVAILABLE",
			retryable: false,
		});
	});
});
describe("stored image reads", () => {
	it("returns absence for a missing object", async () => {
		get.mockResolvedValue(null);
		expect(await repository.read({ key: "missing" })).toBeNull();
	});
	it("sanitizes failed public storage reads", async () => {
		get.mockRejectedValue(new Error("private storage failure"));
		await expect(repository.read({ key: "image" })).rejects.toMatchObject({ errorCode: "STORAGE_UNAVAILABLE" });
	});
});

describe("provider image generation", () => {
	it("hides native transit icons and labels while retaining street labels", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(Png, { headers: { "Content-Type": "image/png" } }));
		await repository.generateImage({
			center: { latitude: -23.5505, longitude: -46.6333 },
			size: { width: 480, height: 480 },
		});
		const url = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
		const layers = url.searchParams.get("styleCustomization")?.split("|");
		expect(layers).toEqual(
			expect.arrayContaining([
				"poi-railway:none",
				"poi-level-1:none",
				"poi-level-2:none",
				"poi-level-3:none",
				"highway-name-major:#626262",
				"highway-name-minor:#737373",
			]),
		);
	});
	it("hides native airport icons and labels to avoid duplicating custom airport landmarks", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(Png, { headers: { "Content-Type": "image/png" } }));
		await repository.generateImage({
			center: { latitude: -23.6261, longitude: -46.6565 },
			size: { width: 480, height: 480 },
		});
		const url = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
		expect(url.searchParams.get("styleCustomization")?.split("|")).toContain("airport-label-major:none");
	});
	it("requests the source-derived light basemap with distinct motorways and hidden boundaries", async () => {
		const provider = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(Png, { headers: { "Content-Type": "image/png" } }));
		vi.stubGlobal("fetch", provider);
		try {
			const stream = await repository.generateImage({
				center: { latitude: -23.5505, longitude: -46.6333 },
				size: { width: 512, height: 256 },
			});
			const url = new URL(String(provider.mock.calls[0]![0]));
			expect(url.searchParams.get("styleCustomization")).toContain("background:#f5f1f0");
			expect(url.searchParams.get("styleCustomization")).toContain("highway-motorway:#b4c0d0");
			expect(url.searchParams.get("styleCustomization")).toContain("water:#99ddff");
			expect(url.searchParams.get("styleCustomization")).not.toContain("%23");
			expect(url.searchParams.get("styleCustomization")).toContain("highway-primary:#d3d7e4");
			expect(url.searchParams.get("styleCustomization")).toContain("highway-trunk:#b5b8ce");
			expect(url.searchParams.get("styleCustomization")).toContain("highway-name-major:#626262");
			expect(url.searchParams.get("styleCustomization")).toContain("boundary-land-level-4:none");
			expect(url.searchParams.get("styleCustomization")).toContain("poi-level-1:none");
			expect(url.searchParams.get("styleCustomization")).toContain("highway-secondary-tertiary:#d3d7e4");
			expect(url.searchParams.get("styleCustomization")).toContain("park:#72ce59");
			expect(url.searchParams.get("styleCustomization")).toContain("landcover-grass:#a8e397");
			expect(url.searchParams.get("styleCustomization")).toContain("landcover-grass-park:#97dc84");
			expect(url.searchParams.get("styleCustomization")).toContain("landcover-wood:#55be3e");
			expect(Object.fromEntries(url.searchParams)).toEqual({
				apiKey: "test-key",
				center: "lonlat:-46.6333,-23.5505",
				style: "osm-bright",
				styleCustomization: StaticStyle.styleCustomization,
				width: "512",
				height: "256",
				scaleFactor: "2",
				zoom: "13",
				format: "png",
			});
			expect(stream).toEqual(Png);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("keeps primary avenues pale across surface roads, bridges, tunnels and ramps", () => {
		const layers = Object.fromEntries(
			StaticStyle.styleCustomization
				.split("|")
				.map((layer) => [layer.split(":")[0], layer.split(":")[1]?.split(";")[0]]),
		);
		expect(layers["highway-trunk"]).toBe("#b5b8ce");
		expect(layers["highway-motorway"]).toBe("#b4c0d0");
		for (const layer of [
			"highway-primary",
			"highway-primary-casing",
			"highway-link",
			"highway-link-casing",
			"bridge-trunk-primary",
			"bridge-trunk-primary-casing",
			"tunnel-trunk-primary",
			"tunnel-trunk-primary-casing",
			"bridge-link",
			"bridge-link-casing",
		]) {
			expect(layers[layer], layer).toBe("#d3d7e4");
		}
	});

	it("narrows road fills and casings while preserving the road hierarchy and label sizes at zoom 13", () => {
		const layers = Object.fromEntries(StaticStyle.styleCustomization.split("|").map((layer) => layer.split(":")));
		expect(layers["highway-name-major"]).toBe("#626262");
		expect(layers["highway-name-minor"]).toBe("#737373");
		expect(layers["highway-name-path"]).toBe("#737373");
		for (const [layer, width] of [
			["highway-minor", 1],
			["highway-secondary-tertiary", 3],
			["highway-primary", 3],
			["highway-trunk", 4],
			["highway-motorway", 4],
			["highway-link", 2],
			["highway-motorway-link", 2],
			["bridge-secondary-tertiary", 3],
			["bridge-trunk-primary", 3],
			["bridge-motorway", 4],
			["bridge-link", 2],
			["bridge-motorway-link", 2],
			["tunnel-minor", 1],
			["tunnel-secondary-tertiary", 3],
			["tunnel-trunk-primary", 3],
			["tunnel-motorway", 4],
		] as const) {
			expect(Number(layers[layer]?.split(";")[1]), layer).toBe(width);
			expect(Number(layers[`${layer}-casing`]?.split(";")[1]), `${layer}-casing`).toBe(width);
		}
	});

	it.each([
		new Error("network"),
		new DOMException("timeout", "TimeoutError"),
		new DOMException("aborted", "AbortError"),
	])("sanitizes failed provider requests", async (error) => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
		try {
			await expect(
				repository.generateImage({
					center: { latitude: 0, longitude: 0 },
					size: { width: 480, height: 480 },
				}),
			).rejects.toMatchObject({
				errorCode: error instanceof DOMException ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
	it.each([
		new Response(null, { status: 500 }),
		new Response(null, { status: 200 }),
		new Response("no", { headers: { "Content-Type": "text/plain" } }),
	])("rejects unusable provider responses", async (response) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
		try {
			await expect(
				repository.generateImage({
					center: { latitude: 0, longitude: 0 },
					size: { width: 480, height: 480 },
				}),
			).rejects.toMatchObject({ errorCode: "PROVIDER_UNAVAILABLE" });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it.each([429, 503, 401])("cancels HTTP %s bodies and exposes provider retry metadata", async (status) => {
		const cancel = vi.fn();
		const response = new Response(new ReadableStream({ cancel: cancel }), {
			status: status,
			headers: { "Retry-After": "3" },
		});
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
		try {
			await expect(
				repository.generateImage({
					center: { latitude: 0, longitude: 0 },
					size: { width: 480, height: 480 },
				}),
			).rejects.toMatchObject({ retryable: status !== 401, retryAfterMs: status === 401 ? undefined : 3000 });
			expect(cancel).toHaveBeenCalledOnce();
		} finally {
			vi.unstubAllGlobals();
		}
	});
	it("combines the attempt timeout with the shared generation cancellation", async () => {
		const controller = new AbortController();
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(Png, { headers: { "Content-Type": "image/png" } })));
		try {
			await repository.generateImage({
				center: { latitude: 0, longitude: 0 },
				size: { width: 480, height: 480 },
				signal: controller.signal,
			});
			const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
			expect(signal?.aborted).toBe(false);
			controller.abort();
			expect(signal?.aborted).toBe(true);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

it.each([new Uint8Array(), new Uint8Array(8 * 1024 * 1024 + 1)])(
	"rejects empty or oversized provider originals",
	async (bytes) => {
		vi.mocked(fetch).mockResolvedValue(new Response(bytes, { headers: { "Content-Type": "image/png" } }));
		await expect(
			repository.generateImage({ center: { latitude: 0, longitude: 0 }, size: { width: 480, height: 480 } }),
		).rejects.toMatchObject({ errorCode: "PROVIDER_UNAVAILABLE", retryable: false });
	},
);
it.each([new Error("private"), new DOMException("timeout", "TimeoutError"), new DOMException("abort", "AbortError")])(
	"sanitizes interrupted provider bodies",
	async (error) => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(
				new ReadableStream({
					start(controller) {
						controller.error(error);
					},
				}),
				{ headers: { "Content-Type": "image/png" } },
			),
		);
		await expect(
			repository.generateImage({ center: { latitude: 0, longitude: 0 }, size: { width: 480, height: 480 } }),
		).rejects.toMatchObject({ errorCode: error instanceof DOMException ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE" });
	},
);

it.each([
	{ status: 503, contentType: "image/png", retryable: true },
	{ status: 200, contentType: "text/plain", retryable: false },
])("preserves the provider failure when discarding an interrupted response: $status", async (scenario) => {
	vi.mocked(fetch).mockResolvedValue(
		new Response(new ReadableStream({ start: (controller) => controller.error(new Error("private stream failure")) }), {
			status: scenario.status,
			headers: { "Content-Type": scenario.contentType },
		}),
	);
	await expect(
		repository.generateImage({ center: { latitude: 0, longitude: 0 }, size: { width: 480, height: 480 } }),
	).rejects.toMatchObject({ errorCode: "PROVIDER_UNAVAILABLE", retryable: scenario.retryable });
});

it("keeps oversized provider images terminal when stream cancellation fails", async () => {
	vi.mocked(fetch).mockResolvedValue(
		new Response(
			new ReadableStream({
				start: (controller) => controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)),
				cancel: () => Promise.reject(new Error("private cleanup failure")),
			}),
			{ headers: { "Content-Type": "image/png" } },
		),
	);
	await expect(
		repository.generateImage({ center: { latitude: 0, longitude: 0 }, size: { width: 480, height: 480 } }),
	).rejects.toMatchObject({ errorCode: "PROVIDER_UNAVAILABLE", retryable: false });
});
