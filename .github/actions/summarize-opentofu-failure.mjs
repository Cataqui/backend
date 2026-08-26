import { readFileSync } from "node:fs";

const [logPath, operation] = process.argv.slice(2);

if (!logPath || !new Set(["plan", "apply"]).has(operation)) {
	throw new Error("Usage: summarize-opentofu-failure.mjs <log-path> <plan|apply>");
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
		.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1[REDACTED]@")
		.replace(/\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/gu, "[REDACTED_JWT]")
		.replace(
			/(access[_-]?token|api[_-]?key|authorization|credential|password|private[_-]?key|secret|token)(\s*[:=]\s*)([^\s,;}]+)/giu,
			"$1$2[REDACTED]",
		)
		.replace(/\b[A-Za-z0-9_+/=-]{40,}\b/gu, "[REDACTED]");
}

const lines = readFileSync(logPath, "utf8")
	.replaceAll(ansiEscape, "")
	.split(/\r?\n/u)
	.map((line) => line.replace(/^\s*[╷│╵]\s?/u, ""));

const diagnostics = [];
for (let index = 0; index < lines.length; index += 1) {
	if (!/^Error:/u.test(lines[index])) {
		continue;
	}

	const block = [lines[index]];
	for (let offset = index + 1; offset < lines.length; offset += 1) {
		if (offset > index && /^Error:/u.test(lines[offset])) {
			break;
		}
		if (/^(?:\s{2})?(?:with |on )/u.test(lines[offset])) {
			block.push(lines[offset]);
		}
	}
	const diagnostic = _redact(block.join("\n").trim());
	if (diagnostic && !diagnostics.includes(diagnostic)) {
		diagnostics.push(diagnostic);
	}
	index += block.length - 1;
}

console.error(`OpenTofu ${operation} failed.`);
if (diagnostics.length === 0) {
	console.error("No safe diagnostic could be extracted; inspect the provider and backend prerequisites.");
} else {
	console.error("Sanitized diagnostics:");
	console.error(diagnostics.slice(0, 5).join("\n\n"));
}
