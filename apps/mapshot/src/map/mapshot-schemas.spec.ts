import { NativeRenderHealthOutputSchema } from "../health/schemas/native-render-health-output.schema";
import { MapshotRenderInputSchema } from "@cataqui/mapshot-workerhole";

const _input = {
	center: { latitude: -23.55, longitude: -46.63 },
	zoom: 13,
	size: { width: 480, height: 480 },
};

it.each([{ profile: "delivery" }, { density: 2 }, { output: { pixelWidth: 960, pixelHeight: 960, quality: 80 } }])(
	"rejects caller-owned rendering controls at native ingress %j",
	(invalid) => {
		expect(MapshotRenderInputSchema.safeParse({ ..._input, ...invalid }).success).toBe(false);
	},
);

it("validates readiness and installed index identity", () => {
	const health = {
		ready: true,
		indexes: { archiveId: "a".repeat(64), sha256: "c".repeat(64) },
	};
	expect(NativeRenderHealthOutputSchema.parse(health)).toEqual(health);
});

it.each([{ ready: false }, { ready: undefined }, { ready: "true" }])(
	"rejects missing or unready health at the owning health schema %#",
	(change) => {
		expect(NativeRenderHealthOutputSchema.safeParse(change).success).toBe(false);
	},
);

it("renders from a scene without callers choosing a source or reference catalogue", async () => {
	const { MapshotRenderInputSchema } = await import("@cataqui/mapshot-workerhole");
	const input = {
		center: _input.center,
		zoom: _input.zoom,
		size: _input.size,
	};
	expect(MapshotRenderInputSchema.parse(input)).toEqual(input);
	expect(MapshotRenderInputSchema.safeParse({ ...input, snapshot: {} }).success).toBe(false);
	expect(MapshotRenderInputSchema.safeParse({ ...input, catalogue: { landmarks: [] } }).success).toBe(false);
});

it("rejects caller-selected catalogues at native ingress", () => {
	expect(MapshotRenderInputSchema.safeParse({ ..._input, catalogue: { landmarks: [] } }).success).toBe(false);
});
