import { z } from "zod";

export const StaticMapSizes = {
	"480x480": { width: 480, height: 480 },
	"480x1280": { width: 480, height: 1280 },
} as const;
export const StaticMapSizeSchema = z.enum(Object.keys(StaticMapSizes) as (keyof typeof StaticMapSizes)[]);
