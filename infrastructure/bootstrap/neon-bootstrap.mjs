import { knownSecrets, log, runAsync } from "./bootstrap-runtime.mjs";
import { getBootstrapSecret, setBootstrapSecret } from "./infisical-bootstrap.mjs";
import {
	classifyNeonCredentialResponse,
	decideNeonAccountCredential,
	getNeonAccountApiKeyName,
	normalizeCreatedNeonAccountApiKey,
	reconcileNeonAccountCredential,
} from "./neon-reconciliation.mjs";
import { ENVIRONMENTS } from "./reconciliation.mjs";

const neonApiBaseUrl = "https://console.neon.tech/api/v2";

function _managementEnvironment() {
	const environment = { ...process.env };
	delete environment.NEON_API_KEY;
	delete environment.NEON_PROFILE;
	return environment;
}

function _runNeonAsync(args) {
	return runAsync("neon", [...args, "--profile", "DEFAULT", "--output", "json", "--no-analytics"], {
		env: _managementEnvironment(),
	});
}

function _parseJson(result, operation) {
	try {
		return JSON.parse(result.stdout);
	} catch {
		throw new Error(`Neon CLI returned invalid JSON while attempting to ${operation}.`);
	}
}

function _normalizeApiKeyInventory(payload) {
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

async function _listAccountApiKeys() {
	return _normalizeApiKeyInventory(_parseJson(await _runNeonAsync(["api-keys", "list"]), "list account API keys"));
}

async function _fetchWithCredential(url, key) {
	try {
		return await fetch(url, {
			headers: { accept: "application/json", authorization: `Bearer ${key}` },
		});
	} catch {
		return undefined;
	}
}

async function _verifyAccountApiKey(platforms, key) {
	knownSecrets.add(key);
	const userResponse = await _fetchWithCredential(`${neonApiBaseUrl}/users/me`, key);
	if (!userResponse) return "indeterminate";
	const userStatus = classifyNeonCredentialResponse(userResponse.status);
	if (userStatus !== "accepted") return userStatus;
	let user;
	try {
		user = await userResponse.json();
	} catch {
		return "indeterminate";
	}
	const userId = user?.id ?? user?.user?.id;
	if (typeof userId !== "string" || !userId) return "indeterminate";

	const accountKeysResponse = await _fetchWithCredential(`${neonApiBaseUrl}/api_keys`, key);
	if (!accountKeysResponse) return "indeterminate";
	if (accountKeysResponse.status === 401) return "rejected";
	if (accountKeysResponse.status === 403) return "foreign";
	if (!accountKeysResponse.ok) return "indeterminate";

	const membersResponse = await _fetchWithCredential(
		`${neonApiBaseUrl}/organizations/${encodeURIComponent(platforms.neon.organization_id)}/members?limit=500`,
		key,
	);
	if (!membersResponse) return "indeterminate";
	if (membersResponse.status === 401) return "rejected";
	if (membersResponse.status === 403 || membersResponse.status === 404) return "foreign";
	if (!membersResponse.ok) return "indeterminate";
	let membersPayload;
	try {
		membersPayload = await membersResponse.json();
	} catch {
		return "indeterminate";
	}
	if (!Array.isArray(membersPayload?.members)) return "indeterminate";
	const accountMembership = membersPayload.members.find(
		(entry) => (entry?.member?.user_id ?? entry?.user_id) === userId,
	);
	return (accountMembership?.member?.role ?? accountMembership?.role) === "admin" ? "accepted" : "foreign";
}

async function _createAccountApiKey(expectedName) {
	const payload = _parseJson(
		await _runNeonAsync(["api-keys", "create", "--name", expectedName]),
		`create ${expectedName}`,
	);
	if (typeof payload?.key === "string" && payload.key) knownSecrets.add(payload.key);
	return normalizeCreatedNeonAccountApiKey(payload, expectedName);
}

async function _revokeAccountApiKey(keyId) {
	const payload = _parseJson(
		await _runNeonAsync(["api-keys", "revoke", String(keyId)]),
		`revoke Neon account API key ${keyId}`,
	);
	if (payload?.id !== Number(keyId) || payload.revoked !== true) {
		throw new Error(`Neon CLI could not verify revocation of account API key ${keyId}.`);
	}
}

async function _readStoredAccountCredential(infisicalProjectId, infisicalToken) {
	const storedByEnvironment = {};
	for (const environment of ENVIRONMENTS) {
		storedByEnvironment[environment] = {
			key: await getBootstrapSecret({
				projectId: infisicalProjectId,
				token: infisicalToken,
				environment,
				name: "NEON_ACCOUNT_API_KEY",
			}),
			id: await getBootstrapSecret({
				projectId: infisicalProjectId,
				token: infisicalToken,
				environment,
				name: "NEON_ACCOUNT_API_KEY_ID",
			}),
		};
	}
	return storedByEnvironment;
}

async function _assertHealthy({ platforms, manifest }, infisicalProjectId, infisicalToken) {
	const expectedName = getNeonAccountApiKeyName(manifest);
	const storedByEnvironment = await _readStoredAccountCredential(infisicalProjectId, infisicalToken);
	const storedKey = storedByEnvironment.staging.key ?? storedByEnvironment.production.key;
	const credentialStatus = storedKey ? await _verifyAccountApiKey(platforms, storedKey) : "missing";
	const decision = decideNeonAccountCredential({
		expectedName,
		storedByEnvironment,
		inventory: await _listAccountApiKeys(),
		credentialStatus,
	});
	if (decision.action !== "reuse") throw new Error("Final Neon account API key verification failed.");
}

export async function verifyNeonCliAuthenticationAsync() {
	const profiles = _parseJson(
		await runAsync("neon", ["profile", "list", "--output", "json", "--no-analytics"], {
			env: _managementEnvironment(),
		}),
		"inspect the authenticated profile",
	);
	if (!Array.isArray(profiles)) throw new Error("Neon CLI returned an invalid profile inventory.");
	const defaultProfiles = profiles.filter((profile) => profile?.name === "DEFAULT");
	if (defaultProfiles.length !== 1 || defaultProfiles[0].auth !== "oauth") {
		throw new Error("Neon DEFAULT profile must be authenticated through `neon auth` before bootstrap.");
	}
	_normalizeApiKeyInventory(_parseJson(await _runNeonAsync(["api-keys", "list"]), "list account API keys"));
}

export async function reconcileNeonAccountApiKey({ platforms, manifest }, infisicalProjectId, infisicalToken) {
	const expectedName = getNeonAccountApiKeyName(manifest);
	const storedByEnvironment = await _readStoredAccountCredential(infisicalProjectId, infisicalToken);
	const decision = await reconcileNeonAccountCredential({
		expectedName,
		storedByEnvironment,
		inventory: await _listAccountApiKeys(),
		verifyKey: (key) => _verifyAccountApiKey(platforms, key),
		revokeKey: (keyId) => _revokeAccountApiKey(keyId),
		createKey: () => _createAccountApiKey(expectedName),
		writeKey: (environment, key) =>
			setBootstrapSecret({
				projectId: infisicalProjectId,
				token: infisicalToken,
				environment,
				name: "NEON_ACCOUNT_API_KEY",
				value: key,
			}),
		writeKeyId: (environment, keyId) =>
			setBootstrapSecret({
				projectId: infisicalProjectId,
				token: infisicalToken,
				environment,
				name: "NEON_ACCOUNT_API_KEY_ID",
				value: keyId,
			}),
	});
	log(`Neon account API key: ${decision.action}.`);
	await _assertHealthy({ platforms, manifest }, infisicalProjectId, infisicalToken);
}
