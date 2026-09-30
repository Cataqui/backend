import { knownSecrets, log, promptHidden } from "./bootstrap-runtime.mjs";
import { classifyDatadogCredentialResponse, reconcileDatadogCredentials } from "./datadog-reconciliation.mjs";
import { getBootstrapSecret, setBootstrapSecret } from "./infisical-bootstrap.mjs";
import { ENVIRONMENTS } from "./reconciliation.mjs";

// Listing API keys needs both keys and the api_keys_read scope, so it proves the pair works for OpenTofu.
async function _verifyCredentials(platforms, credentials) {
	knownSecrets.add(credentials.apiKey);
	knownSecrets.add(credentials.appKey);

	let response;
	try {
		response = await fetch(`https://api.${platforms.datadog.site}/api/v2/api_keys?page%5Bsize%5D=1`, {
			headers: {
				accept: "application/json",
				"DD-API-KEY": credentials.apiKey,
				"DD-APPLICATION-KEY": credentials.appKey,
			},
		});
	} catch {
		return "indeterminate";
	}
	const status = classifyDatadogCredentialResponse(response.status);
	if (status !== "accepted") return status;
	try {
		return Array.isArray((await response.json())?.data) ? "accepted" : "indeterminate";
	} catch {
		return "indeterminate";
	}
}

export async function reconcileDatadogBootstrapCredentials(platforms, infisicalProjectId, infisicalToken) {
	const storedByEnvironment = {};
	for (const environment of ENVIRONMENTS) {
		const secretParams = { projectId: infisicalProjectId, token: infisicalToken, environment };
		storedByEnvironment[environment] = {
			apiKey: await getBootstrapSecret({ ...secretParams, name: "DD_API_KEY" }),
			appKey: await getBootstrapSecret({ ...secretParams, name: "DD_APP_KEY" }),
		};
	}

	const guidance = [
		`Datadog site: ${platforms.datadog.site}`,
		"Use an API key and an application key from Organization Settings.",
		"The application key needs the api_keys_read and api_keys_write scopes.",
		"Bootstrap validates the pair and stores it in both environments.",
	].join("\n");
	const result = await reconcileDatadogCredentials({
		storedByEnvironment,
		verifyCredentials: (credentials) => _verifyCredentials(platforms, credentials),
		requestCredentials: async () => ({
			apiKey: await promptHidden({
				title: "Datadog management credentials",
				message: "Paste DD_API_KEY",
				guidance: guidance,
				unavailableMessage: "Valid Datadog bootstrap credentials are missing; rerun from an interactive terminal.",
			}),
			appKey: await promptHidden({
				title: "Datadog management credentials",
				message: "Paste DD_APP_KEY",
				guidance: guidance,
				unavailableMessage: "Valid Datadog bootstrap credentials are missing; rerun from an interactive terminal.",
			}),
		}),
		writeCredentials: async (environment, credentials) => {
			const secretParams = { projectId: infisicalProjectId, token: infisicalToken, environment };
			await setBootstrapSecret({ ...secretParams, name: "DD_API_KEY", value: credentials.apiKey });
			await setBootstrapSecret({ ...secretParams, name: "DD_APP_KEY", value: credentials.appKey });
		},
	});
	log(`Datadog bootstrap credentials: ${result.action}.`);
}
