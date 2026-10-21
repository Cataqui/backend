import { MateoDefaultPalette } from "@mateo/palette";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PlaceCategoryStyle } from "@cataqui/places/style";
import { LandmarkCategories } from "../../src/landmark/landmark-categories.ts";
import { LandmarkStyle } from "../../src/landmark/landmark-style.ts";
import { StaticRenderingPolicy } from "../../src/map/static-rendering-policy.ts";

// Node-only boundary for @napi-rs/canvas and the existing Mateo TypeScript styles.
// Ruby owns assembly; this adapter only rasterizes the qualified badge assets.
export async function rasterizeLandmarkBadges(params: { destination: URL }): Promise<void> {
	await mkdir(new URL("landmarks/", params.destination), { recursive: true });
	for (const category of LandmarkCategories) {
		const style = PlaceCategoryStyle[category];
		const radius = LandmarkStyle.badgeRadius;
		const density = StaticRenderingPolicy.density;
		const half = Math.ceil(radius + LandmarkStyle.badgeStrokeWidth + 2);
		const size = half * 2;
		const canvas = createCanvas(size * density, size * density);
		const context = canvas.getContext("2d");
		context.scale(density, density);
		context.beginPath();
		context.arc(half, half, radius, 0, Math.PI * 2);
		context.fillStyle = style.color;
		context.fill();
		context.strokeStyle = MateoDefaultPalette.neutral[3];
		context.lineWidth = LandmarkStyle.badgeStrokeWidth;
		context.stroke();
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${style.icon.viewBox}" color="${LandmarkStyle.iconColor}">${style.icon.markup}</svg>`;
		const icon = await loadImage(Buffer.from(svg));
		const iconSize = radius * 2 * LandmarkStyle.iconScale;
		context.drawImage(icon, half - iconSize / 2, half - iconSize / 2, iconSize, iconSize);
		const bytes = canvas.toBuffer("image/png");
		const file = `landmarks/${category}.png`;
		await writeFile(new URL(file, params.destination), bytes);
	}
}

export async function runLandmarkBadgeRasterizer(params: { args: string[] }): Promise<void> {
	const { values } = parseArgs({
		args: params.args,
		options: { destination: { type: "string" } },
	});
	if (values.destination === undefined || !isAbsolute(values.destination)) {
		throw new TypeError("Pass an absolute asset directory with --destination.");
	}
	await rasterizeLandmarkBadges({ destination: pathToFileURL(`${values.destination}/`) });
}

if (import.meta.main) await runLandmarkBadgeRasterizer({ args: process.argv.slice(2) });
