import { knownSecrets, log, run } from "./bootstrap-runtime.mjs";
import { getBootstrapSecret, setBootstrapSecret } from "./infisical-bootstrap.mjs";
import {
	classifyNeonCredentialResponse,
	decideNeonCredential,
	getNeonApiKeyName,
	reconcileNeonCredential,
} from "./neon-reconciliation.mjs";
import { ENVIRONMENTS } from "./reconciliation.mjs";

const neonApiBaseUrl = "https://console.neon.tech/api/v2";

function _managementEnvironment() {
	const environment = { ...process.env };
	delete environment.NEON_API_KEY;
	delete environment.NEON_PROFILE;
	return environment;
}

function _runNeon(args) {
	return run("neon", [...args, "--profile", "DEFAULT", "--output", "json", "--no-analytics"], {
		env: _managementEnvironment(),
	});
}

function _assertOAuthProfile() {
	const payload = _parseJson(
		run("neon", ["profile", "list", "--output", "json", "--no-analytics"], {
			env: _managementEnvironment(),
		}),
		"inspect the authenticated profile",
	);
	if (!Array.isArray(payload)) throw new Error("Neon CLI returned an invalid profile inventory.");
	const defaultProfiles = payload.filter((profile) => profile?.name === "DEFAULT");
	if (defaultProfiles.length !== 1 || defaultProfiles[0].auth !== "oauth") {
		throw new Error("Neon DEFAULT profile must be authenticated through `neon auth` before bootstrap.");
	}
}

function _parseJson(result, operation) {
	try {
		return JSON.parse(result.stdout);
	} catch {
		throw new Error(`Neon CLI returned invalid JSON while attempting to ${operation}.`);
	}
}

function _listApiKeys(platforms) {
	const payload = _parseJson(
		_runNeon(["api-keys", "list", "--org-id", platforms.neon.organization_id]),
		"list organization API keys",
	);
	if (!Array.isArray(payload)) throw new Error("Neon CLI returned an invalid API key inventory.");
	return payload.map((key) => {
		if (
			!Number.isSafeInteger(key?.id) ||
			key.id <= 0 ||
			typeof key.name !== "string" ||
			(key.project_id !== undefined && key.project_id !== null && typeof key.project_id !== "string")
		) {
			throw new Error("Neon CLI returned invalid API key metadata.");
		}
		return { id: key.id, name: key.name, project_id: key.project_id };
	});
}

async function _verifyApiKey(platforms, key) {
	knownSecrets.add(key);
	let response;
	try {
		response = await fetch(`${neonApiBaseUrl}/users/me/organizations`, {
			headers: { accept: "application/json", authorization: `Bearer ${key}` },
		});
	} catch {
		return "indeterminate";
	}
	const status = classifyNeonCredentialResponse(response.status);
	if (status !== "accepted") return status;
	let payload;
	try {
		payload = await response.json();
	} catch {
		return "indeterminate";
	}
	if (!Array.isArray(payload?.organizations)) return "indeterminate";
	if (payload.organizations.length !== 1 || payload.organizations[0]?.id !== platforms.neon.organization_id) {
		return "foreign";
	}

	let inventoryResponse;
	try {
		inventoryResponse = await fetch(
			`${neonApiBaseUrl}/organizations/${encodeURIComponent(platforms.neon.organization_id)}/api_keys`,
			{ headers: { accept: "application/json", authorization: `Bearer ${key}` } },
		);
	} catch {
		return "indeterminate";
	}
	if (inventoryResponse.ok) return "accepted";
	if (inventoryResponse.status === 403) return "foreign";
	return "indeterminate";
}

function _createApiKey(platforms, expectedName) {
	const payload = _parseJson(
		_runNeon(["api-keys", "create", "--name", expectedName, "--org-id", platforms.neon.organization_id]),
		`create ${expectedName}`,
	);
	if (typeof payload?.key === "string" && payload.key) knownSecrets.add(payload.key);
	if (
		Object.keys(payload ?? {})
			.sort()
			.join(",") !== "id,key,name" ||
		!Number.isSafeInteger(payload.id) ||
		payload.id <= 0 ||
		payload.name !== expectedName ||
		typeof payload.key !== "string" ||
		!payload.key
	) {
		throw new Error(`Neon CLI returned invalid credentials for ${expectedName}.`);
	}
	return payload;
}

function _revokeApiKey(platforms, keyId) {
	const payload = _parseJson(
		_runNeon(["api-keys", "revoke", String(keyId), "--org-id", platforms.neon.organization_id]),
		`revoke Neon API key ${keyId}`,
	);
	if (payload?.id !== Number(keyId) || payload.revoked !== true) {
		throw new Error(`Neon CLI could not verify revocation of API key ${keyId}.`);
	}
}

export function verifyNeonCliAuthentication(platforms) {
	_assertOAuthProfile();
	_listApiKeys(platforms);
}

async function _readStoredCredential(platforms, infisicalToken, environment) {
	const key = await getBootstrapSecret({
		platforms,
		token: infisicalToken,
		environment,
		name: "NEON_API_KEY",
	});
	const keyId = await getBootstrapSecret({
		platforms,
		token: infisicalToken,
		environment,
		name: "NEON_API_KEY_ID",
	});
	return { key, keyId };
}

async function _assertHealthy(platforms, infisicalToken, environment) {
	const expectedName = getNeonApiKeyName(environment);
	const stored = await _readStoredCredential(platforms, infisicalToken, environment);
	const credentialStatus = stored.key ? await _verifyApiKey(platforms, stored.key) : "missing";
	const decision = decideNeonCredential({
		expectedName,
		storedKey: stored.key,
		storedKeyId: stored.keyId,
		inventory: _listApiKeys(platforms),
		credentialStatus,
	});
	if (decision.action !== "reuse") throw new Error(`Final Neon credential verification failed for ${environment}.`);
}

export async function reconcileNeonApiKeys(platforms, infisicalToken) {
	for (const environment of ENVIRONMENTS) {
		const expectedName = getNeonApiKeyName(environment);
		const stored = await _readStoredCredential(platforms, infisicalToken, environment);
		const decision = await reconcileNeonCredential({
			expectedName,
			storedKey: stored.key,
			storedKeyId: stored.keyId,
			inventory: _listApiKeys(platforms),
			verifyKey: (key) => _verifyApiKey(platforms, key),
			revokeKey: (keyId) => _revokeApiKey(platforms, keyId),
			createKey: () => _createApiKey(platforms, expectedName),
			writeKey: (key) =>
				setBootstrapSecret({
					platforms,
					token: infisicalToken,
					environment,
					name: "NEON_API_KEY",
					value: key,
				}),
			writeKeyId: (keyId) =>
				setBootstrapSecret({
					platforms,
					token: infisicalToken,
					environment,
					name: "NEON_API_KEY_ID",
					value: keyId,
				}),
		});
		log(`Neon API key ${environment}: ${decision.action}.`);
	}
	for (const environment of ENVIRONMENTS) await _assertHealthy(platforms, infisicalToken, environment);
}
