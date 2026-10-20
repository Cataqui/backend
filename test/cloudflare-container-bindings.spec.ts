import { convertToWranglerConfig, resolveAndParseConfig } from "@cloudflare/config";

it("declares own namespaces through exports while preserving explicit cross-Worker bindings", async () => {
	const result = await resolveAndParseConfig(
		{
			worker: {
				name: "container-owner",
				entrypoint: "worker.ts",
				compatibilityDate: "2026-10-02",
				exports: { OwnContainer: { type: "durable-object", storage: "sqlite" } },
				env: {
					EXTERNAL: { type: "durable-object", worker: "another-worker", exportName: "OtherObject" },
				},
			},
		},
		{ mode: "development", isPreview: false },
	);
	if (!result.success) throw result.error;
	const configuration = convertToWranglerConfig(result.data);
	expect(configuration.exports).toMatchObject({ OwnContainer: { type: "durable-object", storage: "sqlite" } });
	expect(configuration.durable_objects?.bindings).toStrictEqual([
		{ name: "EXTERNAL", class_name: "OtherObject", script_name: "another-worker" },
	]);
});
