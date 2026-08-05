import { appendFileSync, readFileSync } from "node:fs";

function _parseInfisicalCredentialFile({ expectedCredentials, secretFile }) {
	if (secretFile.length === 0) {
		throw new Error("empty Infisical credential file");
	}

	const expectedCredentialNames = new Set(expectedCredentials);
	const credentialValues = new Map();

	for (const [lineIndex, line] of secretFile.split("\n").entries()) {
		const match = line.match(/^([A-Z][A-Z0-9_]*)='(.*)'$/);

		if (match === null || match[2].includes("\r")) {
			throw new Error(`malformed Infisical credential entry on line ${lineIndex + 1}`);
		}

		const [, credentialName, credentialValue] = match;

		if (credentialValues.has(credentialName)) {
			throw new Error(`duplicate Infisical credential: ${credentialName}`);
		}

		if (!expectedCredentialNames.has(credentialName)) {
			throw new Error(`unexpected Infisical credential in isolated profile: ${credentialName}`);
		}

		credentialValues.set(credentialName, credentialValue);
	}

	const missingCredentials = expectedCredentials.filter(
		(credentialName) => !credentialValues.has(credentialName),
	);

	if (missingCredentials.length > 0) {
		throw new Error(`missing Infisical credentials: ${missingCredentials.join(", ")}`);
	}

	const emptyCredentials = expectedCredentials.filter(
		(credentialName) => credentialValues.get(credentialName).length === 0,
	);

	if (emptyCredentials.length > 0) {
		throw new Error(`empty Infisical credentials: ${emptyCredentials.join(", ")}`);
	}

	return credentialValues;
}

function _escapeGitHubWorkflowCommandValue(value) {
	return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function _prepareCredentials() {
	const profiles = JSON.parse(
		readFileSync(".github/actions/load-infisical-secrets/profiles.json", "utf8"),
	);
	const profile = profiles[process.env.INFISICAL_PROFILE];

	if (profile === undefined) {
		throw new Error("unknown Infisical credential profile");
	}

	const credentialValues = _parseInfisicalCredentialFile({
		expectedCredentials: profile.credentials,
		secretFile: readFileSync(process.env.INFISICAL_SECRETS_FILE, "utf8"),
	});

	for (const credentialName of profile.credentials) {
		const credentialValue = credentialValues.get(credentialName);

		process.stdout.write(`::add-mask::${_escapeGitHubWorkflowCommandValue(credentialValue)}\n`);
		appendFileSync(process.env.GITHUB_OUTPUT, `${credentialName.toLowerCase()}=${credentialValue}\n`);
	}
}

_prepareCredentials();
