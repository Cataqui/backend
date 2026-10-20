import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { EngineAssetsService } from "../../src/renderer/engine-assets.service";
import { rasterizeLandmarkBadges, runLandmarkBadgeRasterizer } from "./rasterize-landmark-badges";

const _directories: string[] = [];
afterEach(async () => {
	await Promise.all(_directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it("builds the runtime badge paths with compatible geometry, visible pixels and transparent corners", async () => {
	const directory = await mkdtemp(join(tmpdir(), "mapshot-badge-adapter-"));
	_directories.push(directory);
	const destination = pathToFileURL(`${directory}/`);
	await rasterizeLandmarkBadges({ destination: destination });
	const assets = new EngineAssetsService();
	expect((await readdir(join(directory, "landmarks"))).sort()).toEqual(
		[...assets.badges.values()]
			.map((badge) => relative(join(dirname(assets.fontRoot), "landmarks"), badge.path))
			.sort(),
	);
	const generated = new Map<string, Buffer>();
	for (const badge of assets.badges.values()) {
		const file = relative(dirname(assets.fontRoot), badge.path);
		const bytes = await readFile(join(directory, file));
		generated.set(file, bytes);
		const image = await loadImage(bytes);
		expect([image.width, image.height, badge.logicalSize * 2]).toEqual([48, 48, 48]);
		const canvas = createCanvas(image.width, image.height);
		const context = canvas.getContext("2d");
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, image.width, image.height).data;
		expect([...context.getImageData(24, 8, 1, 1).data]).toEqual([235, 235, 235, 255]);
		expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]);
		expect([...pixels].filter((value, index) => index % 4 === 3 && value === 255).length).toBeGreaterThan(100);
	}
	await rasterizeLandmarkBadges({ destination: destination });
	for (const [file, bytes] of generated) expect(await readFile(join(directory, file))).toEqual(bytes);
});

it("fails when its badge output directory cannot be prepared", async () => {
	const directory = await mkdtemp(join(tmpdir(), "mapshot-badge-adapter-"));
	_directories.push(directory);
	await writeFile(join(directory, "landmarks"), "blocked output");
	await expect(rasterizeLandmarkBadges({ destination: pathToFileURL(`${directory}/`) })).rejects.toThrow();
});

it("rasterizes every runtime badge through the Node CLI without compiled tooling", async () => {
	const directory = await mkdtemp(join(tmpdir(), "mapshot-badge-adapter-"));
	_directories.push(directory);
	await promisify(execFile)(process.execPath, [
		fileURLToPath(new URL("rasterize-landmark-badges.ts", import.meta.url)),
		"--destination",
		directory,
	]);
	const assets = new EngineAssetsService();
	for (const badge of assets.badges.values()) {
		const bytes = await readFile(join(directory, relative(dirname(assets.fontRoot), badge.path)));
		const image = await loadImage(bytes);
		expect(image.width).toBe(badge.logicalSize * 2);
		expect(image.height).toBe(badge.logicalSize * 2);
	}
});

it("uses the explicit output directory when invoked by the build library", async () => {
	const directory = await mkdtemp(join(tmpdir(), "mapshot-badge-adapter-"));
	_directories.push(directory);
	await runLandmarkBadgeRasterizer({ args: ["--destination", directory] });
	expect(await readdir(directory)).toEqual(["landmarks"]);
});

it.each([[], ["--destination", "relative/assets"], ["--unknown"], ["positional"]])(
	"rejects missing, relative, or unsupported badge CLI arguments: %j",
	async (...args) => {
		await expect(runLandmarkBadgeRasterizer({ args: args })).rejects.toThrow();
	},
);
