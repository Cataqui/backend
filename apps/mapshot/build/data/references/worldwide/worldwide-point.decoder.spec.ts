import assert from "node:assert/strict";
import { test } from "vitest";
import { PackedLandmarkKinds } from "../../../../src/landmark/index/packed-landmark-format";
import { decodeWorldwidePoints, type WorldwideDecodedPoint } from "./worldwide-point.decoder";

function _uint(input: bigint | number): Buffer {
	let value = BigInt(input);
	const bytes: number[] = [];
	do {
		const remaining = value >> 7n;
		bytes.push(Number(value & 127n) | (remaining > 0n ? 128 : 0));
		value = remaining;
	} while (value > 0n);
	return Buffer.from(bytes);
}
function _field(number: number, value: string | Buffer | number | bigint, wire: number = 2): Buffer {
	const body = typeof value === "string" ? Buffer.from(value) : Buffer.isBuffer(value) ? value : _uint(value);
	return Buffer.concat([_uint(number * 8 + wire), ...(wire === 2 ? [_uint(body.length)] : []), body]);
}
function _fixture(
	params: {
		ids?: Array<bigint | null>;
		properties?: Array<[string, string | number]>;
		geometry?: Buffer;
		type?: number;
		extraFeature?: Buffer;
		extraLayer?: Buffer;
	} = {},
): Buffer {
	const properties = params.properties ?? [
		["name", "日本病院"],
		["kind", "hospital"],
	];
	const features = (params.ids ?? [9007199254740993n]).map((id) =>
		_field(
			2,
			Buffer.concat([
				...(id === null ? [] : [_field(1, id, 0)]),
				_field(2, Buffer.concat(properties.flatMap((_, index) => [_uint(index), _uint(index)]))),
				_field(3, params.type ?? 1, 0),
				_field(4, params.geometry ?? Buffer.from([9, 2, 2])),
				params.extraFeature ?? Buffer.alloc(0),
			]),
		),
	);
	return _field(
		3,
		Buffer.concat([
			_field(1, "pois"),
			...features,
			...properties.map(([key]) => _field(3, key)),
			...properties.map(([, value]) => {
				if (typeof value === "string") return _field(4, _field(1, value));
				const bytes = Buffer.alloc(8);
				bytes.writeDoubleLE(value);
				return _field(4, _field(3, bytes, 1));
			}),
			_field(5, 4096, 0),
			_field(15, 2, 0),
			params.extraLayer ?? Buffer.alloc(0),
		]),
	);
}
const _decode = (bytes: Uint8Array): WorldwideDecodedPoint[] =>
	decodeWorldwidePoints({ bytes: bytes, categories: new Set(["hospital", "school", "park"]) });

test.each(["bus_stop", "platform", "fuel", "post_office"])(
	"worldwide extraction excludes named %s points before creating the landmark index",
	(kind) => {
		assert.deepEqual(
			decodeWorldwidePoints({
				bytes: _fixture({
					properties: [
						["name", "Provider reference"],
						["kind", kind],
					],
				}),
				categories: new Set(PackedLandmarkKinds),
			}),
			[],
		);
	},
);

test.each([
	"bus_station",
	"marketplace",
	"courthouse",
	"community_centre",
	"pedestrian",
	"ferry_terminal",
	"police",
	"fire_station",
	"clinic",
	"pharmacy",
	"public_building",
	"building",
	"bridge",
] as const)("worldwide extraction preserves named %s points without assigning another source kind", (kind) => {
	const points = decodeWorldwidePoints({
		bytes: _fixture({
			properties: [
				["name", "Referência local"],
				["kind", kind],
				["min_zoom", 14],
			],
		}),
		categories: new Set(PackedLandmarkKinds),
	});
	assert.equal(points[0]?.category, kind);
	assert.equal(points[0]?.id, "9007199254740993");
	assert.equal(points[0]?.name, "Referência local");
	assert.equal(points[0]?.minZoom, 14);
	assert.deepEqual(
		decodeWorldwidePoints({
			bytes: _fixture({ properties: [["kind", kind]] }),
			categories: new Set(PackedLandmarkKinds),
		}),
		[],
	);
});

test("worldwide extraction preserves a valid MVT larger than the former 16 MiB byte budget", () => {
	const name = "A".repeat(16 * 1024 * 1024);
	const points = _decode(
		_fixture({
			properties: [
				["name", name],
				["kind", "hospital"],
			],
		}),
	);
	assert.equal(points.length, 1);
	assert.equal(points[0]?.name, name);
});

test("worldwide extraction prepares trimmed provider names without empty or primary-name alternatives", () => {
	const points = _decode(
		_fixture({
			properties: [
				["name", "  Museu da Cidade\t"],
				["name2", " Museu da Cidade "],
				["name3", "\t"],
				["name:ja", "  市立博物館  "],
				["name_alt", " City Museum "],
				["kind", "hospital"],
			],
		}),
	);
	assert.equal(points[0]?.name, "Museu da Cidade");
	assert.deepEqual(points[0]?.names, { "name:ja": "市立博物館", name_alt: "City Museum" });
});

test("worldwide extraction retains exact uint64 identities and provider alternative names with an empty primary", () => {
	const points = _decode(
		_fixture({
			ids: [9007199254740992n, 9007199254740993n, 18446744073709551615n],
			properties: [
				["name", ""],
				["name:ja", "日本病院"],
				["name2", "โรงพยาบาล"],
				["kind", "hospital"],
				["kind_detail", "clinic"],
				["min_zoom", 14],
				["rank", 2],
			],
		}),
	);
	assert.deepEqual(
		points.map((point) => point.id),
		["9007199254740992", "9007199254740993", "18446744073709551615"],
	);
	assert.equal(points[0]?.name, "");
	assert.deepEqual(points[0]?.names, { "name:ja": "日本病院", name2: "โรงพยาบาล" });
	assert.equal(points[0]?.detail, "clinic");
	assert.equal(points[0]?.minZoom, 14);
	assert.equal(points[0]?.rank, 2);
	assert.equal(points[0]?.u, 1 / 4096);
});
test("worldwide extraction only accepts useful named single points with genuine source IDs", () => {
	assert.deepEqual(_decode(_fixture({ ids: [null] })), []);
	assert.deepEqual(_decode(_fixture({ type: 2 })), []);
	assert.deepEqual(_decode(_fixture({ geometry: Buffer.from([17, 2, 2, 2, 2]) })), []);
	assert.deepEqual(
		_decode(
			_fixture({
				properties: [
					["name", "Shop"],
					["kind", "bakery"],
				],
			}),
		),
		[],
	);
	assert.deepEqual(
		_decode(
			_fixture({
				properties: [
					["name", "  "],
					["name_short", "Short"],
					["kind", "hospital"],
				],
			}),
		),
		[],
	);
	assert.equal(
		_decode(
			_fixture({
				properties: [
					["name", "Park"],
					["name_short", "P"],
					["kind", "park"],
				],
			}),
		)[0]?.names["name_short"],
		"P",
	);
});
test("worldwide exact ID reader rejects duplicate IDs and overflowing or truncated uint64 values", () => {
	assert.throws(() => _decode(_fixture({ extraFeature: _field(1, 3, 0) })));
	assert.throws(() => _decode(_fixture({ ids: [18446744073709551616n] })));
	assert.throws(() => _decode(_fixture({ extraFeature: Buffer.from([8, 128]) })));
});
test.each([
	["min_zoom", -1],
	["min_zoom", Number.NaN],
	["min_zoom", Number.POSITIVE_INFINITY],
	["rank", Number.NaN],
	["rank", Number.NEGATIVE_INFINITY],
] as const)("worldwide decoder rejects invalid provider %s value %s", (key, value) => {
	assert.throws(() =>
		_decode(
			_fixture({
				properties: [
					["name", "Hospital"],
					["kind", "hospital"],
					[key, value],
				],
			}),
		),
	);
});
test("worldwide decoder fails closed on ambiguous layers, invalid framing, extents and properties", () => {
	assert.throws(() => _decode(Buffer.concat([_fixture(), _fixture()])));
	assert.throws(() => _decode(_fixture({ extraLayer: _field(1, "pois") })));
	assert.throws(() => _decode(_fixture({ extraLayer: _field(5, 0, 0) })));
	assert.throws(() =>
		_decode(
			_fixture({
				properties: [
					["name", "Hospital"],
					["kind", "hospital"],
					["kind_detail", 9],
				],
			}),
		),
	);
	assert.throws(() => _decode(_fixture().subarray(0, -1)));
	assert.throws(() => _decode(Buffer.from([0])), {
		name: "ReferenceImportError",
		code: "INTEGRITY",
		message: "Invalid worldwide landmark MVT",
	});
	assert.throws(() => _decode(Buffer.from([27])));
	assert.deepEqual(_decode(_field(3, _field(1, "water"))), []);
});
test("worldwide decoder bounds ignored protobuf fixed fields and rejects malformed layer framing", () => {
	assert.equal(
		_decode(Buffer.concat([_field(9, Buffer.alloc(8), 1), _fixture(), _field(10, Buffer.alloc(4), 5)])).length,
		1,
	);
	assert.deepEqual(_decode(_field(3, _field(1, "pois"))), []);
	assert.equal(
		_decode(
			_fixture({
				properties: [
					["name2", "Hospital"],
					["kind", "hospital"],
				],
			}),
		)[0]?.name,
		"",
	);
	assert.throws(() => _decode(_field(3, 1, 0)));
	assert.throws(() => _decode(_field(3, _field(2, 1, 0))));
	assert.throws(() => _decode(_fixture({ extraLayer: _field(5, Buffer.from([1])) })));
	assert.throws(() => _decode(_field(3, _field(15, 2, 0))));
});
