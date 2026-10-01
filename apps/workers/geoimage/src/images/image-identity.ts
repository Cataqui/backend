import type { z } from "zod";
import { MapRendering } from "../maps/map-rendering";
import type { ImageQuerySchema } from "./schemas/image-query.schema";

export async function getImageIdentity(params: {
	input: z.output<typeof ImageQuerySchema>;
	environment: GeoimageWorkerEnv["ENVIRONMENT"];
}): Promise<string> {
	const encoded = new TextEncoder().encode(
		JSON.stringify([
			MapRendering.version,
			params.environment,
			params.input.latitude,
			params.input.longitude,
			params.input.map.size.width,
			params.input.map.size.height,
			params.input.map.density,
		]),
	);
	const hash = await crypto.subtle.digest("SHA-256", encoded);
	return `maps/v1/${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}.jpg`;
}
