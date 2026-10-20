import { type MapshotRenderInput, MapshotRenderInputSchema } from "./mapshot-render-input.schema";

const _input = {
	center: { latitude: -23.55, longitude: -46.63 },
	zoom: 13,
	size: { width: 480, height: 480 },
} satisfies MapshotRenderInput;

it("renders from a scene without callers choosing a source or reference catalogue", () => {
	expect(MapshotRenderInputSchema.parse(_input)).toEqual(_input);
	expect(MapshotRenderInputSchema.safeParse({ ..._input, snapshot: {} }).success).toBe(false);
	expect(MapshotRenderInputSchema.safeParse({ ..._input, catalogue: {} }).success).toBe(false);
});

it.each([480, 1280])("accepts the supported logical viewport with height %s", (height) => {
	const input = { center: _input.center, zoom: 13, size: { width: 480, height: height } };
	expect(MapshotRenderInputSchema.parse(input)).toEqual(input);
});

it.each([
	{ width: 1, height: 1 },
	{ width: 481, height: 600 },
	{ width: 1024, height: 768 },
	{ width: 6000, height: 1 },
	{ width: 3000, height: 2000 },
])("accepts caller-selected dimensions outside Maps presets %j", (size) => {
	expect(MapshotRenderInputSchema.parse({ ..._input, size: size }).size).toEqual(size);
});

it.each([
	{ size: { width: 0, height: 480 } },
	{ size: { width: 480, height: -1 } },
	{ size: { width: 1.5, height: 480 } },
	{ size: { width: 480, height: Number.POSITIVE_INFINITY } },
	{ density: 2 },
	{ profile: "delivery" },
	{ output: { pixelWidth: 960, pixelHeight: 960, quality: 80 } },
])("rejects unsupported viewports and caller-owned rendering controls %j", (invalid) => {
	expect(MapshotRenderInputSchema.safeParse({ ..._input, ...invalid }).success).toBe(false);
});

it.each([-1, 0, 7.5, 14, 25, 32, 1000])("accepts a representable caller-selected zoom %s", (zoom) => {
	const input = { ..._input, zoom: zoom };
	expect(MapshotRenderInputSchema.parse(input)).toEqual(input);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1024, -1075])(
	"rejects a zoom whose projection is not representable: %s",
	(zoom) => {
		expect(MapshotRenderInputSchema.safeParse({ ..._input, zoom: zoom }).success).toBe(false);
	},
);
