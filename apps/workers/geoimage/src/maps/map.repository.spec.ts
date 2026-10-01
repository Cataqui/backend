import { MapRendering } from "./map-rendering";
import { Jpeg } from "../../test/fakes";
import { MapRepository } from "./map.repository";

it("requests the source-derived light basemap with distinct motorways and hidden boundaries", async () => {
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
			styleCustomization: MapRendering.styleCustomization,
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

it("keeps primary avenues pale across surface roads, bridges, tunnels and ramps", () => {
	const layers = Object.fromEntries(
		MapRendering.styleCustomization
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
	const layers = Object.fromEntries(MapRendering.styleCustomization.split("|").map((layer) => layer.split(":")));
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
