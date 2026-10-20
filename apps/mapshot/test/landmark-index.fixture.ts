import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { zxyToTileId } from "pmtiles";
import { PackedLandmarkColumns } from "../src/landmark/index/packed-landmark-format";
import type { PackedLandmarkIndexReference } from "../src/landmark/index/schemas/packed-landmark-index-reference.schema";
import type { PackedLandmarkRow } from "../src/landmark/index/schemas/packed-landmark-row.schema";

export function createPackedLandmarkIndexFixture(
	params: { archiveId?: string; rows?: PackedLandmarkRow[]; metadata?: Record<string, unknown> } = {},
): { bytes: Uint8Array; reference: PackedLandmarkIndexReference } {
	const archiveId = params.archiveId ?? "a".repeat(64);
	const rows = params.rows ?? [["18446744073709551615", "Biblioteca", {}, "library", null, -46.63, -23.55, 13, null]];
	const cells = new Map<number, PackedLandmarkRow[]>();
	for (const row of rows) {
		const x = Math.min(8191, Math.max(0, Math.floor(((row[5] + 180) / 360) * 8192)));
		const y = Math.min(
			8191,
			Math.max(0, Math.floor(((1 - Math.asinh(Math.tan((row[6] * Math.PI) / 180)) / Math.PI) / 2) * 8192)),
		);
		const id = zxyToTileId(13, x, y);
		const cell = cells.get(id) ?? [];
		cell.push(row);
		cells.set(id, cell);
	}
	const entries = [...cells]
		.sort(([left], [right]) => left - right)
		.map(([id, points]) => ({
			id: id,
			bytes: gzipSync(JSON.stringify(points)),
		}));
	const directory: number[] = [];
	const append = (value: number): void => {
		let remaining = value;
		while (remaining >= 128) {
			directory.push((remaining % 128) + 128);
			remaining = Math.floor(remaining / 128);
		}
		directory.push(remaining);
	};
	append(entries.length);
	let previous = 0;
	for (const entry of entries) {
		append(entry.id - previous);
		previous = entry.id;
	}
	for (const _entry of entries) append(1);
	for (const entry of entries) append(entry.bytes.byteLength);
	for (let index = 0; index < entries.length; index++) append(index === 0 ? 1 : 0);
	const root = gzipSync(Uint8Array.from(directory));
	const metadata = gzipSync(
		JSON.stringify({
			schemaVersion: 1,
			format: "mapshot-landmark-points-v1",
			coverage: "worldwide-source-zoom-15",
			sourceZoom: 15,
			indexZoom: 13,
			columns: PackedLandmarkColumns,
			records: rows.length,
			cells: cells.size,
			...params.metadata,
		}),
	);
	const tileBytes = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
	const bytes = new Uint8Array(127 + root.byteLength + metadata.byteLength + tileBytes);
	const view = new DataView(bytes.buffer);
	bytes.set([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 3]);
	for (const [offset, value] of [
		[8, 127],
		[16, root.byteLength],
		[24, 127 + root.byteLength],
		[32, metadata.byteLength],
		[40, 127 + root.byteLength + metadata.byteLength],
		[48, 0],
		[56, 127 + root.byteLength + metadata.byteLength],
		[64, tileBytes],
		[72, cells.size],
		[80, cells.size],
		[88, cells.size],
	] as const)
		view.setBigUint64(offset, BigInt(value), true);
	bytes.set([1, 2, 2, 0, 13, 13], 96);
	for (const [offset, value] of [
		[102, -1800000000],
		[106, -850511287],
		[110, 1800000000],
		[114, 850511287],
	] as const)
		view.setInt32(offset, value, true);
	bytes[118] = 13;
	bytes.set(root, 127);
	bytes.set(metadata, 127 + root.byteLength);
	let position = 127 + root.byteLength + metadata.byteLength;
	for (const entry of entries) {
		bytes.set(entry.bytes, position);
		position += entry.bytes.byteLength;
	}
	return {
		bytes: bytes,
		reference: {
			key: `source/import/attempts/fixture/${archiveId}/references/landmarks.pmtiles`,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			bytes: bytes.byteLength,
			archiveId: archiveId,
		},
	};
}
