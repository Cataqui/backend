import type { GenerateStaticMapsInput } from "./generate-static-maps-input.schema.js";
import type { GenerateStaticMapsResult } from "./generate-static-maps-result.schema.js";

export interface IMapsRpc {
	generateStaticMaps(input: GenerateStaticMapsInput): Promise<GenerateStaticMapsResult>;
}
