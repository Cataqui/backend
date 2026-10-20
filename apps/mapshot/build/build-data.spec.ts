import * as td from "testdouble";
import { getBasemapIndexFiles } from "../src/tiles/sources/indexes/basemap-index-manifest";
import { createDeploymentCandidate } from "../test/basemap-deployment.fixture";
import { createIndexFixture } from "../test/basemap-index.fixture";
import { runMapshotBuildDataCli, validateMapshotBuildData } from "./build-data";

afterEach(() => td.reset());

it("uses the owned source schema to validate a matching prepared archive", async () => {
	const candidate = createDeploymentCandidate();
	await expect(validateMapshotBuildData({ kind: "source", value: candidate })).resolves.toEqual(candidate);
	await expect(
		validateMapshotBuildData({
			kind: "source",
			value: { ...candidate, prepared: { ...candidate.prepared, archiveId: "f".repeat(64) } },
		}),
	).rejects.toThrow();
});

it("rejects stale source documents instead of silently discarding fields", async () => {
	await expect(
		validateMapshotBuildData({ kind: "source", value: { ...createDeploymentCandidate(), legacy: true } }),
	).rejects.toThrow();
});

it("returns the authoritative index manifest and deduplicated content-addressed files", async () => {
	const fixture = await createIndexFixture();
	await expect(validateMapshotBuildData({ kind: "index-manifest", value: fixture.manifest })).resolves.toEqual({
		manifest: fixture.manifest,
		files: getBasemapIndexFiles({ manifest: fixture.manifest }),
	});
	await expect(
		validateMapshotBuildData({ kind: "index-manifest", value: { ...fixture.manifest, version: 2 } }),
	).rejects.toThrow();
});

it("rejects unsupported validation operations", async () => {
	await expect(validateMapshotBuildData({ kind: "private-value", value: {} })).rejects.toThrow(TypeError);
});

it("writes only validated JSON on successful CLI requests", async () => {
	const candidate = createDeploymentCandidate();
	const output = td.replace(process.stdout, "write");
	const error = td.replace(console, "error");
	td.when(output(JSON.stringify(candidate))).thenReturn(true);
	await expect(runMapshotBuildDataCli({ args: ["source"], input: JSON.stringify(candidate) })).resolves.toBe(0);
	expect(td.explain(output).calls.map((call) => call.args)).toEqual([[JSON.stringify(candidate)]]);
	td.verify(error(td.matchers.anything()), { times: 0, ignoreExtraArgs: true });
});

it.each([
	{ args: [], input: "{}" },
	{ args: ["source", "extra"], input: "{}" },
	{ args: ["source"], input: "private malformed JSON" },
	{ args: ["source"], input: JSON.stringify({ ...createDeploymentCandidate(), privateValue: "secret" }) },
	{ args: ["unknown-private-kind"], input: "{}" },
])("suppresses data and diagnostics for an invalid CLI request %#", async (request) => {
	const output = td.replace(process.stdout, "write");
	const error = td.replace(console, "error");
	td.when(output(td.matchers.anything()), { ignoreExtraArgs: true }).thenReturn(true);
	await expect(runMapshotBuildDataCli(request)).resolves.toBe(1);
	expect(td.explain(output).callCount).toBe(0);
	expect(td.explain(error).calls.map((call) => call.args)).toEqual([["Mapshot build data validation failed."]]);
});
