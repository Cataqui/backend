import { type MapshotRenderOutput, MapshotRenderOutputSchema } from "./mapshot-render-output.schema";

const _output = {
	bytes: new ReadableStream<Uint8Array>(),
	contentType: "image/webp",
	width: 960,
	height: 960,
	digest: "a".repeat(64),
} satisfies MapshotRenderOutput;

it("accepts an image with only the fields needed for delivery", () => {
	const output = MapshotRenderOutputSchema.parse(_output);
	expect(output).toEqual(_output);
	expect(output.bytes).toBe(_output.bytes);
});

it.each([
	{ bytes: new Uint8Array([1, 2, 3]) },
	{ bytes: [1, 2, 3] },
	{ contentType: "image/png" },
	{ width: 0 },
	{ height: -1 },
	{ width: 1.5 },
	{ digest: "invalid" },
])("rejects invalid image delivery data %j", (change) => {
	expect(MapshotRenderOutputSchema.safeParse({ ..._output, ...change }).success).toBe(false);
});

it.each(["metadata", "source", "resources", "timings"])(
	"excludes internal %s from the communication contract",
	(field) => {
		expect(MapshotRenderOutputSchema.safeParse({ ..._output, [field]: {} }).success).toBe(false);
	},
);
