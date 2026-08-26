import { constantTimeEqual, ENVIRONMENTS } from "./reconciliation.mjs";

export function classifyNeonCredentialResponse(status) {
	if (status >= 200 && status < 300) return "accepted";
	if (status === 401) return "rejected";
	return "indeterminate";
}

export function getNeonAccountApiKeyName(manifest) {
	return manifest.neon.api_keys.account_bootstrap.name;
}

export function getNeonProjectApiKeyName(manifest, environment) {
	return manifest.neon.api_keys.project_access[`cataqui_${environment}`].name;
}

export function normalizeCreatedNeonAccountApiKey(payload, expectedName) {
	if (
		!Number.isSafeInteger(payload?.id) ||
		payload.id <= 0 ||
		payload.name !== expectedName ||
		typeof payload.key !== "string" ||
		!payload.key ||
		(payload.project_id !== undefined && payload.project_id !== null)
	) {
		throw new Error(`Neon CLI returned invalid credentials for ${expectedName}.`);
	}
	return { id: payload.id, name: payload.name, key: payload.key };
}

function _getSharedStoredCredential(storedByEnvironment) {
	const staging = storedByEnvironment.staging ?? {};
	const production = storedByEnvironment.production ?? {};
	if (staging.key && production.key && !constantTimeEqual(staging.key, production.key)) {
		throw new Error("Staging and production contain conflicting Neon account API keys.");
	}
	if (staging.id && production.id && String(staging.id) !== String(production.id)) {
		throw new Error("Staging and production contain conflicting Neon account API key IDs.");
	}
	return {
		key: staging.key ?? production.key,
		id: staging.id ? String(staging.id) : production.id ? String(production.id) : undefined,
	};
}

function _resolveExpectedInventory(inventory, expectedName) {
	const namedKeys = inventory.filter((key) => key.name === expectedName);
	if (namedKeys.length > 1) throw new Error(`Duplicate Neon bootstrap ownership for ${expectedName}.`);
	return namedKeys[0];
}

export function decideNeonAccountCredential({ expectedName, storedByEnvironment, inventory, credentialStatus }) {
	const stored = _getSharedStoredCredential(storedByEnvironment);
	const namedKey = _resolveExpectedInventory(inventory, expectedName);
	const metadataKey = stored.id ? inventory.find((key) => String(key.id) === stored.id) : undefined;

	if (metadataKey && metadataKey.name !== expectedName) {
		throw new Error(`Foreign Neon account API key metadata conflicts with ${expectedName}.`);
	}
	if (namedKey && stored.id && String(namedKey.id) !== stored.id) {
		throw new Error(`Neon account API key metadata does not match ${expectedName}.`);
	}
	if (credentialStatus === "indeterminate") {
		throw new Error(`Unable to determine whether Neon account API key ${expectedName} is valid.`);
	}
	if (credentialStatus === "foreign") {
		throw new Error(`Neon account API key ${expectedName} has the wrong account or organization role.`);
	}
	if (credentialStatus === "accepted") {
		if (!stored.key || !namedKey) throw new Error(`Foreign Neon account credential conflicts with ${expectedName}.`);
		const keyId = String(namedKey.id);
		const missingEnvironments = ENVIRONMENTS.filter(
			(environment) =>
				!storedByEnvironment[environment]?.key || String(storedByEnvironment[environment]?.id ?? "") !== keyId,
		);
		return {
			action: missingEnvironments.length === 0 ? "reuse" : "repair",
			keyId,
			missingEnvironments,
		};
	}
	if (namedKey) return { action: "replace", keyId: String(namedKey.id) };
	return { action: "create" };
}

export async function reconcileNeonAccountCredential({
	expectedName,
	storedByEnvironment,
	inventory,
	verifyKey,
	revokeKey,
	createKey,
	writeKey,
	writeKeyId,
}) {
	const stored = _getSharedStoredCredential(storedByEnvironment);
	const credentialStatus = stored.key ? await verifyKey(stored.key) : "missing";
	const decision = decideNeonAccountCredential({
		expectedName,
		storedByEnvironment,
		inventory,
		credentialStatus,
	});
	if (decision.action === "reuse") return decision;

	let credential;
	let targets;
	if (decision.action === "repair") {
		credential = { id: decision.keyId, key: stored.key };
		targets = decision.missingEnvironments;
	} else {
		if (decision.action === "replace") await revokeKey(decision.keyId);
		credential = await createKey();
		targets = ENVIRONMENTS;
	}
	if (!credential?.id || !credential?.key) throw new Error("Neon did not return a complete account API key.");
	for (const environment of targets) {
		await writeKey(environment, credential.key);
		await writeKeyId(environment, String(credential.id));
	}
	return { action: decision.action, keyId: String(credential.id) };
}
