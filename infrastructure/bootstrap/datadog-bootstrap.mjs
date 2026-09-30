import { knownSecrets, log, requestJson, runAsync } from "./bootstrap-runtime.mjs";
import {
	classifyDatadogCredentialResponse,
	DATADOG_OPENTOFU_SCOPES,
	isSupportedPupVersion,
	reconcileDatadogEnvironmentCredentials,
	resolveDatadogApiKey,
	resolveDatadogRole,
	resolveDatadogServiceAccount,
} from "./datadog-reconciliation.mjs";
import { getBootstrapSecret, setBootstrapSecret } from "./infisical-bootstrap.mjs";
import { ENVIRONMENTS } from "./reconciliation.mjs";

// pup must use the interactive OAuth session, never stray key variables from the shell.
function _pupEnvironment(platforms) {
	const environment = { ...process.env, DD_SITE: platforms.datadog.site };
	delete environment.DD_API_KEY;
	delete environment.DD_APP_KEY;
	return environment;
}

export async function verifyDatadogCliAuthenticationAsync(platforms) {
	const version = await runAsync("pup", ["--version"], { env: _pupEnvironment(platforms) });
	if (!isSupportedPupVersion(version.stdout)) {
		throw new Error(`pup 1.18.0 or newer is required (found ${version.stdout.trim()}); run brew upgrade pup.`);
	}
	const status = await runAsync("pup", ["--no-agent", "auth", "status", "--output", "json"], {
		env: _pupEnvironment(platforms),
		allowFailure: true,
	});
	let session;
	try {
		session = JSON.parse(status.stdout);
	} catch {
		session = undefined;
	}
	if (session?.authenticated !== true || session.site !== platforms.datadog.site) {
		throw new Error(
			`pup is not authenticated to Datadog site ${platforms.datadog.site}; run pup auth login --site ${platforms.datadog.site} --extra-scopes api_keys_read,api_keys_write,service_account_write.`,
		);
	}
}

async function _getAccessToken(platforms) {
	const token = (
		await runAsync("pup", ["--no-agent", "auth", "token"], { env: _pupEnvironment(platforms) })
	).stdout.trim();
	if (!token) throw new Error("pup did not return a Datadog access token; run pup auth login.");
	knownSecrets.add(token);
	return token;
}

function _createDatadogClient(platforms, token) {
	const baseUrl = `https://api.${platforms.datadog.site}/api/v2`;
	return (path, options = {}) =>
		requestJson(`${baseUrl}${path}`, {
			...options,
			headers: { authorization: `Bearer ${token}`, ...options.headers },
		});
}

async function _ensureServiceAccount(datadog, expected) {
	const accounts = await datadog("/users?filter%5Bservice_account%5D=true&page%5Bsize%5D=100");
	const existing = resolveDatadogServiceAccount(
		accounts.data.map((account) => ({
			id: account.id,
			name: account.attributes.name,
			email: account.attributes.email,
			disabled: account.attributes.disabled,
		})),
		expected,
	);
	if (existing) return existing.id;

	const roles = await datadog("/roles?page%5Bsize%5D=100");
	const adminRole = resolveDatadogRole(
		roles.data.map((role) => ({ id: role.id, name: role.attributes.name })),
		"Datadog Admin Role",
	);
	const created = await datadog("/service_accounts", {
		method: "POST",
		acceptedStatuses: [200, 201],
		body: {
			data: {
				type: "users",
				attributes: { name: expected.name, email: expected.email, service_account: true },
				relationships: { roles: { data: [{ type: "roles", id: adminRole.id }] } },
			},
		},
	});
	return created.data.id;
}

async function _getOrCreateApiKey(datadog, keyName) {
	const apiKeys = await datadog("/api_keys?page%5Bsize%5D=100");
	const existing = resolveDatadogApiKey(
		apiKeys.data.map((apiKey) => ({ id: apiKey.id, name: apiKey.attributes.name })),
		keyName,
	);
	const response = existing
		? await datadog(`/api_keys/${existing.id}`)
		: await datadog("/api_keys", {
				method: "POST",
				acceptedStatuses: [201],
				body: { data: { type: "api_keys", attributes: { name: keyName } } },
			});
	const key = response.data.attributes.key;
	if (typeof key !== "string" || !key) throw new Error(`Datadog did not return the value of API key ${keyName}.`);
	knownSecrets.add(key);
	return key;
}

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

/**
 * Gives OpenTofu its own Datadog credentials per environment: an API key plus a scoped application key owned by a
 * dedicated service account, so access never depends on a person's account. Both are stored in /opentofu/bootstrap.
 */
export async function reconcileDatadogBootstrapCredentials(
	{ platforms, manifest },
	infisicalProjectId,
	infisicalToken,
) {
	const datadog = _createDatadogClient(platforms, await _getAccessToken(platforms));
	const serviceAccountId = await _ensureServiceAccount(datadog, manifest.datadog.opentofu.service_account);
	const applicationKeysPath = `/service_accounts/${serviceAccountId}/application_keys`;

	for (const environment of ENVIRONMENTS) {
		const keyName = manifest.datadog.opentofu.credentials[environment].name;
		const secretParams = { projectId: infisicalProjectId, token: infisicalToken, environment: environment };
		const result = await reconcileDatadogEnvironmentCredentials({
			stored: {
				apiKey: await getBootstrapSecret({ ...secretParams, name: "DD_API_KEY" }),
				appKey: await getBootstrapSecret({ ...secretParams, name: "DD_APP_KEY" }),
			},
			verifyCredentials: (credentials) => _verifyCredentials(platforms, credentials),
			getOrCreateApiKey: () => _getOrCreateApiKey(datadog, keyName),
			createApplicationKey: async () => {
				const created = await datadog(applicationKeysPath, {
					method: "POST",
					acceptedStatuses: [201],
					body: {
						data: { type: "application_keys", attributes: { name: keyName, scopes: [...DATADOG_OPENTOFU_SCOPES] } },
					},
				});
				knownSecrets.add(created.data.attributes.key);
				return { id: created.data.id, key: created.data.attributes.key };
			},
			listApplicationKeys: async () =>
				(await datadog(`${applicationKeysPath}?page%5Bsize%5D=100`)).data
					.filter((applicationKey) => applicationKey.attributes.name === keyName)
					.map((applicationKey) => ({ id: applicationKey.id })),
			deleteApplicationKey: (applicationKeyId) =>
				datadog(`${applicationKeysPath}/${applicationKeyId}`, { method: "DELETE", acceptedStatuses: [204] }),
			writeCredentials: async (credentials) => {
				await setBootstrapSecret({ ...secretParams, name: "DD_API_KEY", value: credentials.apiKey });
				await setBootstrapSecret({ ...secretParams, name: "DD_APP_KEY", value: credentials.appKey });
			},
		});
		log(`Datadog ${environment} OpenTofu credentials: ${result.action}.`);
	}
}
