export interface MapTile {
	key: string;
	address: { z: number; x: number; y: number };
	worldOffset: number;
	bytes: Uint8Array;
}
