import { StaticReadQueryInputSchema } from "./static-read-query-input.schema";
it.each(["480x480", "480x1280"])("accepts supported size %s", (size) => {
	expect(StaticReadQueryInputSchema.parse({ size: size })).toEqual({ size: size });
});
it.each([
	{},
	{ size: "480x600" },
	{ size: "0480x480" },
	{ size: "480x480", zoom: "13" },
	{ size: "480x480", quality: "80" },
])("rejects unsupported image selectors %j", (input) => {
	expect(StaticReadQueryInputSchema.safeParse(input).success).toBe(false);
});
