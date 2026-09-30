import { Jpeg } from "../../test/fakes";
import { MapRepository } from "./map.repository";

it("requests an image using explicit map parameters independent of location request presets", async () => {
	const provider = vi
		.fn<typeof fetch>()
		.mockResolvedValue(new Response(Jpeg, { headers: { "Content-Type": "image/jpeg" } }));
	vi.stubGlobal("fetch", provider);
	try {
		const stream = await new MapRepository({ config: { apiKey: "test-key" } }).getImage({
			center: { latitude: -23.5505, longitude: -46.6333 },
			size: { width: 512, height: 256 },
			density: 1,
		});
		const url = new URL(String(provider.mock.calls[0]![0]));
		expect(Object.fromEntries(url.searchParams)).toEqual({
			apiKey: "test-key",
			center: "lonlat:-46.6333,-23.5505",
			style: "osm-bright",
			width: "512",
			height: "256",
			scaleFactor: "1",
			zoom: "13",
			format: "jpeg",
		});
		expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(Jpeg);
	} finally {
		vi.unstubAllGlobals();
	}
});
