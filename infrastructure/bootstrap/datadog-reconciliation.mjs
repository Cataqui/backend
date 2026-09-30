import { constantTimeEqual, ENVIRONMENTS } from "./reconciliation.mjs";

function _isCompleteCredentialSet(credentials) {
	return Boolean(credentials?.apiKey && credentials?.appKey);
}

function _isSameCredentialSet(left, right) {
	return constantTimeEqual(left.apiKey, right.apiKey) && constantTimeEqual(left.appKey, right.appKey);
}

// A half-written set (only one of the two keys) is treated as absent for that environment and repaired.
function _getStoredCredentials(storedByEnvironment) {
	const completeSets = ENVIRONMENTS.map((environment) => storedByEnvironment[environment]).filter(
		_isCompleteCredentialSet,
	);
	if (completeSets.length === 2 && !_isSameCredentialSet(completeSets[0], completeSets[1])) {
		throw new Error("Staging and production contain different Datadog bootstrap credentials.");
	}
	return completeSets[0];
}

export function classifyDatadogCredentialResponse(status) {
	if (status >= 200 && status < 300) return "accepted";
	if (status === 401 || status === 403) return "rejected";
	return "indeterminate";
}

export function decideDatadogCredentials({ storedByEnvironment, credentialStatus }) {
	const storedCredentials = _getStoredCredentials(storedByEnvironment);
	if (!storedCredentials) return { action: "request", writeEnvironments: [...ENVIRONMENTS] };
	if (credentialStatus === "accepted") {
		return {
			action: "reuse",
			writeEnvironments: ENVIRONMENTS.filter(
				(environment) => !_isCompleteCredentialSet(storedByEnvironment[environment]),
			),
		};
	}
	if (credentialStatus === "rejected") {
		return { action: "replace", writeEnvironments: [...ENVIRONMENTS] };
	}
	throw new Error("Unable to determine whether the stored Datadog bootstrap credentials are valid.");
}

export async function reconcileDatadogCredentials({
	storedByEnvironment,
	verifyCredentials,
	requestCredentials,
	writeCredentials,
}) {
	const storedCredentials = _getStoredCredentials(storedByEnvironment);
	const credentialStatus = storedCredentials ? await verifyCredentials(storedCredentials) : "missing";
	const decision = decideDatadogCredentials({ storedByEnvironment, credentialStatus });

	let selectedCredentials = storedCredentials;
	if (decision.action === "request" || decision.action === "replace") {
		selectedCredentials = await requestCredentials();
		if (!_isCompleteCredentialSet(selectedCredentials)) {
			throw new Error("The supplied Datadog bootstrap credentials are incomplete.");
		}
		const suppliedStatus = await verifyCredentials(selectedCredentials);
		if (suppliedStatus === "rejected") throw new Error("The supplied Datadog bootstrap credentials are invalid.");
		if (suppliedStatus !== "accepted") {
			throw new Error("Unable to verify the supplied Datadog bootstrap credentials.");
		}
	}

	for (const environment of decision.writeEnvironments) {
		await writeCredentials(environment, selectedCredentials);
	}
	return { action: decision.action, writtenEnvironments: decision.writeEnvironments };
}
