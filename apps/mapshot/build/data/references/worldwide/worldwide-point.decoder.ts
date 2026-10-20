import { ReferenceImportErrorCode } from "../reference-import-error-code.enum.ts";
import { VectorTile, type VectorTileLayer } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { PackedLandmarkRow } from "../../../../src/landmark/index/schemas/packed-landmark-row.schema.ts";
import { ReferenceImportError } from "../reference-import.error.ts";

// Kept separate from geographic projection: decoding a shared physical member
// once must preserve its local position for every logical source-tile alias.
export type WorldwideDecodedPoint = {
	ordinal: number;
	id: string;
	category: PackedLandmarkRow[3];
	name: string;
	names: Record<string, string>;
	detail: string | null;
	minZoom: number | null;
	rank: number | null;
	u: number;
	v: number;
};
type _Cursor = { bytes: Uint8Array; pos: number; end: number };
type _Field = { number: number; wire: number; start: number; end: number };

function _fail(): never {
	throw new ReferenceImportError({
		code: ReferenceImportErrorCode.INTEGRITY,
		message: "Invalid worldwide landmark MVT",
	});
}
function _uint(cursor: _Cursor): bigint {
	let value = 0n;
	for (let index = 0; index < 10; index += 1) {
		const byte = cursor.bytes[cursor.pos++];
		if (byte === undefined || cursor.pos > cursor.end || (index === 9 && byte > 1)) _fail();
		value |= BigInt(byte & 127) << BigInt(index * 7);
		if ((byte & 128) === 0) return value;
	}
	return _fail();
}
function* _fields(cursor: _Cursor): Generator<_Field> {
	while (cursor.pos < cursor.end) {
		const tag = _uint(cursor);
		if (tag > 0xffffffffn || tag >> 3n === 0n) _fail();
		const number = Number(tag >> 3n);
		const wire = Number(tag & 7n);
		if (wire === 0) {
			const start = cursor.pos;
			_uint(cursor);
			yield { number: number, wire: wire, start: start, end: cursor.pos };
			continue;
		}
		if (wire !== 1 && wire !== 2 && wire !== 5) _fail();
		const length = wire === 2 ? _uint(cursor) : BigInt(wire === 1 ? 8 : 4);
		if (length > BigInt(cursor.end - cursor.pos)) _fail();
		const start = cursor.pos;
		cursor.pos += Number(length);
		yield { number: number, wire: wire, start: start, end: cursor.pos };
	}
}
function _cursor(params: { bytes: Uint8Array; field: _Field }): _Cursor {
	return { bytes: params.bytes, pos: params.field.start, end: params.field.end };
}

// The maintained decoder owns properties and geometry. The wire pass preserves
// exact uint64 IDs, which its numeric feature IDs cannot represent.
export function decodeWorldwidePoints(params: {
	bytes: Uint8Array;
	categories: ReadonlySet<PackedLandmarkRow[3]>;
}): WorldwideDecodedPoint[] {
	if (params.bytes.length < 1) _fail();
	let ranges: _Field[] | null = null;
	let extent = 4096;
	const names = new Set<string>();
	for (const field of _fields({ bytes: params.bytes, pos: 0, end: params.bytes.length })) {
		if (field.number !== 3) continue;
		if (field.wire !== 2) _fail();
		let name: string | null = null;
		let layerExtent = 4096;
		const features: _Field[] = [];
		for (const child of _fields(_cursor({ bytes: params.bytes, field: field }))) {
			if (child.number === 1) {
				if (name !== null || child.wire !== 2) _fail();
				name = new TextDecoder("utf-8", { fatal: true }).decode(params.bytes.subarray(child.start, child.end));
			} else if (child.number === 2) {
				if (child.wire !== 2) _fail();
				features.push(child);
			} else if (child.number === 5) {
				if (child.wire !== 0) _fail();
				const value = _uint(_cursor({ bytes: params.bytes, field: child }));
				if (value < 1n || value > 0xffffffffn) _fail();
				layerExtent = Number(value);
			}
		}
		if (name === null || name.length === 0 || names.has(name)) _fail();
		names.add(name);
		if (name === "pois") {
			ranges = features;
			extent = layerExtent;
		}
	}
	if (ranges === null || ranges.length === 0) return [];
	const layer = new VectorTile(new PbfReader(params.bytes)).layers["pois"] as VectorTileLayer;
	const output: WorldwideDecodedPoint[] = [];
	for (const [ordinal, range] of ranges.entries()) {
		const feature = layer.feature(ordinal);
		const properties = feature.properties;
		const category = properties["kind"] as PackedLandmarkRow[3];
		if (feature.type !== 1 || typeof category !== "string" || !params.categories.has(category)) continue;
		const name = typeof properties["name"] === "string" ? properties["name"].trim() : "";
		const alternatives = Object.entries(properties).filter((entry): entry is [string, string] => {
			const [key, value] = entry;
			return (
				(key === "name2" || key === "name3" || key.startsWith("name:") || key.startsWith("name_")) &&
				typeof value === "string"
			);
		});
		const lacksProviderName =
			!name.trim() &&
			!alternatives.some(
				([key, value]) => (key === "name2" || key === "name3" || key.startsWith("name:")) && value.trim(),
			);
		if (lacksProviderName) continue;
		let id: string | null = null;
		for (const item of _fields(_cursor({ bytes: params.bytes, field: range }))) {
			if (item.number !== 1) continue;
			if (item.wire !== 0 || id !== null) _fail();
			id = _uint(_cursor({ bytes: params.bytes, field: item })).toString();
		}

		if (id === null) continue;
		const geometry = feature.loadGeometry();
		if (geometry.length !== 1 || geometry[0]?.length !== 1) continue;
		const point = geometry[0][0];
		if (point === undefined || !Number.isFinite(point.x) || !Number.isFinite(point.y)) _fail();
		const names: Record<string, string> = {};
		for (const [key, value] of alternatives) {
			const alternative = value.trim();
			if (alternative.length > 0 && alternative !== name) names[key] = alternative;
		}
		const detail = properties["kind_detail"];
		const minZoom = properties["min_zoom"];
		const rank = properties["rank"];
		if (
			(detail !== undefined && typeof detail !== "string") ||
			(minZoom !== undefined && (typeof minZoom !== "number" || !Number.isFinite(minZoom) || minZoom < 0)) ||
			(rank !== undefined && (typeof rank !== "number" || !Number.isFinite(rank)))
		)
			_fail();
		output.push({
			ordinal: ordinal,
			id: id,
			category: category,
			name: name,
			names: names,
			detail: detail ?? null,
			minZoom: minZoom ?? null,
			rank: rank ?? null,
			u: point.x / extent,
			v: point.y / extent,
		});
	}
	return output;
}
