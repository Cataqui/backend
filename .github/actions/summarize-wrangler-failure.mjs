import { readFileSync } from "node:fs";

const [logPath, application] = process.argv.slice(2);

if (!logPath || !application) {
	throw new Error("Usage: summarize-wrangler-failure.mjs <log-path> <application>");
}

const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
const sensitiveEnvironmentName =
	/(?:ACCESS_TOKEN|API_KEY|AUTH_JWT|CREDENTIAL|DATABASE.*URL|HMAC_KEY|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)/;

const sensitiveValues = Object.entries(process.env)
	.filter(([name, value]) => sensitiveEnvironmentName.test(name) && typeof value === "string" && value.length >= 4)
	.map(([, value]) => value)
	.sort((left, right) => right.length - left.length);

function _redact(value) {
	let redacted = value;
	for (const sensitiveValue of sensitiveValues) {
		redacted = redacted.replaceAll(sensitiveValue, "[REDACTED]");
	}
	return redacted
		.replace(/https?:\/\/[^\s]+/giu, "[REDACTED_URL]")
		.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[REDACTED_EMAIL]")
		.replace(/\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/gu, "[REDACTED_JWT]")
		.replace(
			/(access[_-]?token|api[_-]?key|authorization|credential|password|private[_-]?key|secret|token)(\s*[:=]\s*)([^\s,;}]+)/giu,
			"$1$2[REDACTED]",
		)
		.replace(/\b[0-9a-f]{32,}\b/giu, "[REDACTED_ID]")
		.replace(/\b[A-Za-z0-9_+/=-]{40,}\b/gu, "[REDACTED]");
}

const lines = readFileSync(logPath, "utf8")
	.replaceAll(ansiEscape, "")
	.split(/\r?\n/u)
	.map((line) => line.replace(/^\s*[│╷╵✘▲■]\s*/u, "").trim())
	.filter(Boolean);

const diagnostics = [];
for (const line of lines) {
	if (!/(?:error|failed|forbidden|unauthorized|invalid|not found|code:\s*\d+)/iu.test(line)) {
		continue;
	}
	const diagnostic = _redact(line);
	if (!diagnostics.includes(diagnostic)) {
		diagnostics.push(diagnostic);
	}
}

console.error(`${application} deployment command failed.`);
if (diagnostics.length === 0) {
	console.error("No safe Wrangler diagnostic could be extracted; inspect the Cloudflare deployment prerequisites.");
} else {
	console.error("Sanitized Wrangler diagnostics:");
	console.error(diagnostics.slice(0, 8).join("\n"));
}
