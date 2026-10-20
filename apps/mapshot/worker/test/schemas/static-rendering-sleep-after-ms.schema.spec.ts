import { StaticRenderingSleepAfterMsSchema } from "./static-rendering-sleep-after-ms.schema";
import { loadAndParseConfig } from "@cloudflare/config";
import { resolve } from "node:path";

describe("StaticRenderingSleepAfterMsSchema", () => {
	it.each(["development", "staging", "production"])(
		"validates the configured sleep timeout for %s before runtime",
		async (mode) => {
			const loaded = await loadAndParseConfig(resolve(import.meta.dirname, "../../cloudflare.config.ts"), {
				mode: mode,
				isPreview: false,
			});
			if (!loaded.result.success) throw loaded.result.error;
			const binding = loaded.result.data.worker?.env?.["SLEEP_AFTER_MS"];
			const milliseconds = binding?.type === "json" ? binding.value : undefined;
			expect(() => StaticRenderingSleepAfterMsSchema.parse(milliseconds)).not.toThrow();
		},
	);
	it("keeps the renderer warm when SLEEP_AFTER_MS is omitted", () => {
		expect(StaticRenderingSleepAfterMsSchema.parse(undefined)).toBeUndefined();
	});
	it.each([1, 1_000, 600_000, 3_600_000, 21_600_000])(
		"accepts %i inactivity milliseconds without conversion",
		(milliseconds) => {
			expect(StaticRenderingSleepAfterMsSchema.parse(milliseconds)).toBe(milliseconds);
		},
	);
	it.each([0, -1, 0.5, 21_600_001, NaN, Infinity, "600000", "10m", "6h", "", null])(
		"rejects invalid SLEEP_AFTER_MS rather than keeping a renderer warm: %j",
		(milliseconds) => {
			expect(StaticRenderingSleepAfterMsSchema.safeParse(milliseconds).success).toBe(false);
		},
	);
});
