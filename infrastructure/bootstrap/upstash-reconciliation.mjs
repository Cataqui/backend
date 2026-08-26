import { constantTimeEqual, ENVIRONMENTS } from "./reconciliation.mjs";

function _getStoredKey(storedByEnvironment) {
	const stagingKey = storedByEnvironment.staging;
	const productionKey = storedByEnvironment.production;
	if (stagingKey && productionKey && !constantTimeEqual(stagingKey, productionKey)) {
		throw new Error("Staging and production contain different Upstash bootstrap API keys.");
	}
	return stagingKey ?? productionKey;
}

export function classifyUpstashCredentialResponse(status) {
	if (status >= 200 && status < 300) return "accepted";
	if (status === 401 || status === 403) return "rejected";
	return "indeterminate";
}

export function decideUpstashCredential({ storedByEnvironment, credentialStatus }) {
	const storedKey = _getStoredKey(storedByEnvironment);
	if (!storedKey) return { action: "request", writeEnvironments: [...ENVIRONMENTS] };
	if (credentialStatus === "accepted") {
		return {
			action: "reuse",
			writeEnvironments: ENVIRONMENTS.filter((environment) => !storedByEnvironment[environment]),
		};
	}
	if (credentialStatus === "rejected") {
		return { action: "replace", writeEnvironments: [...ENVIRONMENTS] };
	}
	throw new Error("Unable to determine whether the stored Upstash bootstrap API key is valid.");
}

export async function reconcileUpstashCredential({ storedByEnvironment, verifyKey, requestKey, writeKey }) {
	const storedKey = _getStoredKey(storedByEnvironment);
	const credentialStatus = storedKey ? await verifyKey(storedKey) : "missing";
	const decision = decideUpstashCredential({ storedByEnvironment, credentialStatus });

	let selectedKey = storedKey;
	if (decision.action === "request" || decision.action === "replace") {
		selectedKey = await requestKey();
		if (!selectedKey) throw new Error("The supplied Upstash bootstrap API key is empty.");
		const suppliedStatus = await verifyKey(selectedKey);
		if (suppliedStatus === "rejected") throw new Error("The supplied Upstash bootstrap API key is invalid.");
		if (suppliedStatus !== "accepted") {
			throw new Error("Unable to verify the supplied Upstash bootstrap API key.");
		}
	}

	for (const environment of decision.writeEnvironments) {
		await writeKey(environment, selectedKey);
	}
	return { action: decision.action, writtenEnvironments: decision.writeEnvironments };
}
