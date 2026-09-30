import { resolveUniqueNamedResource } from "./reconciliation.mjs";

// The bootstrap key only issues keys. OpenTofu gives every other Datadog root its own scoped keys, so new
// permissions are a code change and a deploy, not another bootstrap run.
export const DATADOG_OPENTOFU_SCOPES = Object.freeze([
	"api_keys_read",
	"api_keys_write",
	"service_account_write",
	"user_access_read",
]);

// `pup auth token`, which the bootstrap uses to call the Datadog API, first shipped in pup 1.18.0.
const MINIMUM_PUP_VERSION = [1, 18, 0];

export function isSupportedPupVersion(versionOutput) {
	const match = /\b(\d+)\.(\d+)\.(\d+)\b/.exec(versionOutput);
	if (!match) return false;
	const version = match.slice(1, 4).map(Number);
	for (let index = 0; index < MINIMUM_PUP_VERSION.length; index += 1) {
		if (version[index] !== MINIMUM_PUP_VERSION[index]) return version[index] > MINIMUM_PUP_VERSION[index];
	}
	return true;
}

// A new application key is rejected for a short time until Datadog propagates it, so the first check can fail.
const ISSUED_KEY_PROPAGATION_DELAYS_MS = Object.freeze([2_000, 4_000, 8_000, 15_000, 30_000]);

export function classifyDatadogCredentialResponse(status) {
	if (status >= 200 && status < 300) return "accepted";
	if (status === 401 || status === 403) return "rejected";
	return "indeterminate";
}

export function resolveDatadogServiceAccount(serviceAccounts, expected) {
	return resolveUniqueNamedResource(
		serviceAccounts,
		expected.name,
		(serviceAccount) => serviceAccount.email === expected.email && serviceAccount.disabled === false,
	);
}

export function resolveDatadogRole(roles, roleName) {
	const role = resolveUniqueNamedResource(roles, roleName);
	if (!role) throw new Error(`Datadog role ${roleName} does not exist.`);
	return role;
}

export function resolveDatadogApiKey(apiKeys, keyName) {
	return resolveUniqueNamedResource(apiKeys, keyName);
}

/**
 * Finds the owned application key behind the stored credential by its last four characters and reports whether its
 * scopes differ from the required set. Fails closed when the stored key is not an owned key of the service account.
 */
export function decideDatadogApplicationKeyScopes({ applicationKeys, storedAppKey, requiredScopes }) {
	const matches = applicationKeys.filter((applicationKey) => storedAppKey.endsWith(applicationKey.last4));
	if (matches.length !== 1) {
		throw new Error("The stored Datadog application key is not exactly one owned key of the OpenTofu service account.");
	}
	const currentScopes = [...(matches[0].scopes ?? [])].sort();
	const expectedScopes = [...requiredScopes].sort();
	return {
		id: matches[0].id,
		needsUpdate: JSON.stringify(currentScopes) !== JSON.stringify(expectedScopes),
	};
}

export function decideDatadogCredentials({ stored, credentialStatus }) {
	if (!stored?.apiKey || !stored?.appKey) return { action: "issue" };
	if (credentialStatus === "accepted") return { action: "reuse" };
	if (credentialStatus === "rejected") return { action: "issue" };
	throw new Error("Unable to determine whether the stored Datadog bootstrap credentials are valid.");
}

/**
 * Reuses one environment's stored OpenTofu credentials when Datadog accepts them. Otherwise it reuses the named API
 * key, issues a new application key (Datadog only reveals its value once), stores the verified pair, and only then
 * removes older same-named application keys whose values were lost.
 */
export async function reconcileDatadogEnvironmentCredentials({
	stored,
	verifyCredentials,
	getOrCreateApiKey,
	createApplicationKey,
	deleteApplicationKey,
	listApplicationKeys,
	writeCredentials,
	wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
	const credentialStatus = stored?.apiKey && stored?.appKey ? await verifyCredentials(stored) : "missing";
	const decision = decideDatadogCredentials({ stored, credentialStatus });
	if (decision.action === "reuse") return { action: "reuse" };

	const apiKey = await getOrCreateApiKey();
	const applicationKey = await createApplicationKey();
	const issuedCredentials = { apiKey: apiKey, appKey: applicationKey.key };
	let issuedStatus = await verifyCredentials(issuedCredentials);
	for (const delay of ISSUED_KEY_PROPAGATION_DELAYS_MS) {
		if (issuedStatus === "accepted") break;
		await wait(delay);
		issuedStatus = await verifyCredentials(issuedCredentials);
	}
	if (issuedStatus !== "accepted") {
		await deleteApplicationKey(applicationKey.id);
		throw new Error(`Datadog did not accept the newly issued OpenTofu credentials (last check: ${issuedStatus}).`);
	}

	await writeCredentials({ apiKey: apiKey, appKey: applicationKey.key });
	const staleApplicationKeys = (await listApplicationKeys()).filter((key) => key.id !== applicationKey.id);
	for (const staleApplicationKey of staleApplicationKeys) {
		await deleteApplicationKey(staleApplicationKey.id);
	}
	return { action: "issue", deletedApplicationKeys: staleApplicationKeys.length };
}
