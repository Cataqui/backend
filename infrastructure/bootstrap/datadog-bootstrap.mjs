import { runAsync } from "./bootstrap-runtime.mjs";

export async function verifyDatadogCliAuthenticationAsync(params) {
	await runAsync("pup", ["auth", "status", "--read-only", "--site", params.platforms.datadog.site, "--output", "json"]);
}
