import { writeFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import sharp from "sharp";
import { MapshotRenderOutputSchema } from "./mapshot-render-output.schema.ts";
import type { IMapshotRpc } from "./mapshot-rpc.interface.ts";

try {
	const [configPath, outputPath] = process.argv.slice(2);
	if (configPath === undefined || outputPath === undefined || process.argv.length !== 4) {
		throw new TypeError("Expected probe configuration and private output paths.");
	}
	let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ MAPSHOT: IMapshotRpc }>>> | undefined;
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		// SDK disposal must run even if remote setup finishes after the timeout.
		await Promise.race([
			(async (): Promise<void> => {
				const created = await getPlatformProxy<{ MAPSHOT: IMapshotRpc }>({
					configPath: configPath,
					persist: false,
				});
				if (controller.signal.aborted) {
					await created.dispose();
					controller.signal.throwIfAborted();
				}
				proxy = created;
				const output = await created.env.MAPSHOT.render({
					center: { latitude: -23.5505, longitude: -46.6333 },
					zoom: 13,
					size: { width: 480, height: 480 },
				});
				try {
					controller.signal.throwIfAborted();
					const result = MapshotRenderOutputSchema.parse(output);
					const bytes = await new Response(
						result.bytes.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal: controller.signal }),
					).arrayBuffer();
					const image = sharp(new Uint8Array(bytes));
					if ((await image.metadata()).format !== "webp")
						throw new TypeError("Live Mapshot returned an invalid image format.");
					const decoded = await image.raw().toBuffer({ resolveWithObject: true });
					controller.signal.throwIfAborted();
					await writeFile(
						outputPath,
						JSON.stringify({
							width: decoded.info.width,
							height: decoded.info.height,
							bytes: decoded.data.byteLength,
						}),
						{ flag: "wx", mode: 0o600 },
					);
				} finally {
					if (!output.bytes.locked) await output.bytes.cancel(controller.signal.reason);
				}
			})(),
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => {
					controller.abort(new DOMException("Live Mapshot render timed out.", "TimeoutError"));
					reject(controller.signal.reason);
				}, 120_000);
			}),
		]);
	} finally {
		clearTimeout(timer);
		await proxy?.dispose();
	}
} catch {
	console.error("Live Mapshot SDK probe failed.");
	process.exitCode = 1;
}
