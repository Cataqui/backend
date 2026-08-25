export function classifyNeonCredentialResponse(status) {
	if (status >= 200 && status < 300) return "accepted";
	if (status === 401) return "rejected";
	return "indeterminate";
}

export function getNeonApiKeyName(environment) {
	return `cataqui-backend-opentofu-${environment}`;
}

export function decideNeonCredential({ expectedName, storedKey, storedKeyId, inventory, credentialStatus }) {
	const namedKeys = inventory.filter((key) => key.name === expectedName);
	if (namedKeys.length > 1) throw new Error(`Duplicate Neon bootstrap ownership for ${expectedName}.`);
	const namedKey = namedKeys[0];
	const normalizedStoredKeyId = storedKeyId ? String(storedKeyId) : undefined;
	const metadataKey = normalizedStoredKeyId
		? inventory.find((key) => String(key.id) === normalizedStoredKeyId)
		: undefined;

	if (metadataKey && metadataKey.name !== expectedName) {
		throw new Error(`Foreign Neon API key metadata conflicts with ${expectedName}.`);
	}
	if (namedKey?.project_id) {
		throw new Error(`Neon API key ${expectedName} must be organization-wide, not project-scoped.`);
	}
	if (namedKey && normalizedStoredKeyId && String(namedKey.id) !== normalizedStoredKeyId) {
		throw new Error(`Neon API key metadata does not match ${expectedName}.`);
	}
	if (credentialStatus === "indeterminate") {
		throw new Error(`Unable to determine whether Neon API key ${expectedName} is valid.`);
	}
	if (credentialStatus === "foreign") {
		throw new Error(`Neon API key ${expectedName} belongs to a foreign organization or has the wrong scope.`);
	}
	if (credentialStatus === "accepted") {
		if (!storedKey || !namedKey) throw new Error(`Foreign Neon credential conflicts with ${expectedName}.`);
		return normalizedStoredKeyId
			? { action: "reuse", keyId: normalizedStoredKeyId }
			: { action: "adopt", keyId: String(namedKey.id) };
	}
	if (namedKey) return { action: "replace", keyId: String(namedKey.id) };
	return { action: "create" };
}

export async function reconcileNeonCredential({
	expectedName,
	storedKey,
	storedKeyId,
	inventory,
	verifyKey,
	revokeKey,
	createKey,
	writeKey,
	writeKeyId,
}) {
	const credentialStatus = storedKey ? await verifyKey(storedKey) : "missing";
	const decision = decideNeonCredential({
		expectedName,
		storedKey,
		storedKeyId,
		inventory,
		credentialStatus,
	});
	if (decision.action === "reuse") return decision;
	if (decision.action === "adopt") {
		await writeKeyId(decision.keyId);
		return decision;
	}
	if (decision.action === "replace") await revokeKey(decision.keyId);
	const created = await createKey();
	await writeKey(created.key);
	await writeKeyId(String(created.id));
	return { action: decision.action, keyId: String(created.id) };
}
