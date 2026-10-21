import { loadAndParseConfig, type ParsedInputConfig } from "@cloudflare/config";
import { resolve } from "node:path";

export async function loadCloudflareConfiguration(params: {
	application: string;
	mode: "development" | "staging" | "production";
}): Promise<ParsedInputConfig> {
	const configuration = await loadAndParseConfig(resolve(process.cwd(), params.application, "cloudflare.config.ts"), {
		mode: params.mode,
		isPreview: false,
	});
	if (!configuration.result.success) throw configuration.result.error;
	return configuration.result.data;
}
