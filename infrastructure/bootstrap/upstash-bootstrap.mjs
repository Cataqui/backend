import { knownSecrets, log, promptHidden } from "./bootstrap-runtime.mjs";
import { getBootstrapSecret, setBootstrapSecret } from "./infisical-bootstrap.mjs";
import { ENVIRONMENTS } from "./reconciliation.mjs";
import { classifyUpstashCredentialResponse, reconcileUpstashCredential } from "./upstash-reconciliation.mjs";

const upstashDatabasesUrl = "https://api.upstash.com/v2/redis/databases";

async function _verifyApiKey(platforms, apiKey) {
	knownSecrets.add(apiKey);
	const basicCredential = Buffer.from(`${platforms.upstash.account_email}:${apiKey}`).toString("base64");
	knownSecrets.add(basicCredential);

	let response;
	try {
		response = await fetch(upstashDatabasesUrl, {
			headers: { accept: "application/json", authorization: `Basic ${basicCredential}` },
		});
	} catch {
		return "indeterminate";
	}
	const status = classifyUpstashCredentialResponse(response.status);
	if (status !== "accepted") return status;
	try {
		return Array.isArray(await response.json()) ? "accepted" : "indeterminate";
	} catch {
		return "indeterminate";
	}
}

export async function reconcileUpstashApiKey(platforms, infisicalProjectId, infisicalToken) {
	const storedByEnvironment = {};
	for (const environment of ENVIRONMENTS) {
		storedByEnvironment[environment] = await getBootstrapSecret({
			projectId: infisicalProjectId,
			token: infisicalToken,
			environment,
			name: "UPSTASH_API_KEY",
		});
	}

	const result = await reconcileUpstashCredential({
		storedByEnvironment,
		verifyKey: (apiKey) => _verifyApiKey(platforms, apiKey),
		requestKey: () =>
			promptHidden({
				message: "Upstash Management API key: ",
				unavailableMessage: "A valid Upstash API key is missing; rerun from an interactive terminal.",
			}),
		writeKey: (environment, apiKey) =>
			setBootstrapSecret({
				projectId: infisicalProjectId,
				token: infisicalToken,
				environment,
				name: "UPSTASH_API_KEY",
				value: apiKey,
			}),
	});
	log(`Upstash API key: ${result.action}.`);
}
