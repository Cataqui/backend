import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constantTimeEqual, ENVIRONMENTS, resolveUniqueNamedResource } from "./reconciliation.mjs";
import { knownSecrets, repositoryRoot, requestJson, runAsync } from "./bootstrap-runtime.mjs";
import {
	classifyInfisicalOidcInspection,
	explainInfisicalIdentityCreationFailure,
	INFISICAL_PROJECT_TYPE,
	isInfisicalPrivilegeAlreadyPresent,
	reconcileInfisicalFolderState,
	reconcileInfisicalManualSecrets,
	reconcileInfisicalProjectState,
	reconcileInfisicalSecretPlaceholder,
	resolveInfisicalPrivilege,
} from "./infisical-reconciliation.mjs";

export const bootstrapSecretPath = "/opentofu/bootstrap";
const infisicalApiBaseUrl = "https://app.infisical.com";

function _headers(token) {
	return { authorization: `Bearer ${token}` };
}

function _stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(_stableJson).sort().join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${_stableJson(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function _normalizePermissions(permissions) {
	return permissions.flatMap((permission) =>
		(Array.isArray(permission.action) ? permission.action : [permission.action]).map((action) => ({
			subject: permission.subject,
			action,
			conditions: permission.conditions ?? {},
			...(permission.inverted ? { inverted: true } : {}),
		})),
	);
}

async function _listProjects(token, request) {
	const payload = await request(`${infisicalApiBaseUrl}/api/v1/projects`, { headers: _headers(token) });
	if (!Array.isArray(payload.projects)) throw new Error("Infisical returned an invalid project inventory.");
	return payload.projects;
}

export async function reconcileInfisicalProject(
	{ platforms, manifest },
	infisicalToken,
	{ request = requestJson } = {},
) {
	const expectedOrganizationId = platforms.infisical.organization_id;
	const expectedName = manifest.infisical.project.name;
	const expectedSlug = manifest.infisical.project.slug;
	return reconcileInfisicalProjectState({
		expectedOrganizationId,
		expectedName,
		expectedSlug,
		listProjects: () => _listProjects(infisicalToken, request),
		createProject: async () => {
			const created = await request(`${infisicalApiBaseUrl}/api/v1/projects`, {
				method: "POST",
				headers: _headers(infisicalToken),
				body: {
					projectName: expectedName,
					slug: expectedSlug,
					type: INFISICAL_PROJECT_TYPE,
					shouldCreateDefaultEnvs: false,
					hasDeleteProtection: true,
				},
				acceptedStatuses: [200, 201],
			});
			return created.project;
		},
		updateProject: async (project) => {
			const updated = await request(`${infisicalApiBaseUrl}/api/v1/projects/${project.id}`, {
				method: "PATCH",
				headers: _headers(infisicalToken),
				body: { name: expectedName, slug: expectedSlug, hasDeleteProtection: true },
				acceptedStatuses: [200],
			});
			return updated.project;
		},
		createEnvironment: ({ projectId, environment }) =>
			request(`${infisicalApiBaseUrl}/api/v1/projects/${projectId}/environments`, {
				method: "POST",
				headers: _headers(infisicalToken),
				body: {
					name: environment === "staging" ? "Staging" : "Production",
					slug: environment,
					position: environment === "staging" ? 1 : 2,
				},
				acceptedStatuses: [200, 201],
			}),
	});
}

export async function getInfisicalSecret({ projectId, token, environment, secretPath, name }) {
	const query = new URLSearchParams({
		projectId,
		environment,
		secretPath,
		type: "shared",
		viewSecretValue: "true",
		expandSecretReferences: "false",
	});
	const url = `${infisicalApiBaseUrl}/api/v4/secrets/${encodeURIComponent(name)}?${query}`;
	const response = await fetch(url, { headers: { accept: "application/json", ..._headers(token) } });
	if (response.status === 404) return undefined;
	if (!response.ok) throw new Error(`Infisical could not read ${name} in ${environment} (${response.status}).`);
	const payload = await response.json();
	const value = payload.secret?.secretValue;
	if (typeof value === "string" && value) knownSecrets.add(value);
	return value;
}

export async function setInfisicalSecret({ projectId, token, environment, secretPath, name, value }) {
	knownSecrets.add(value);
	const existing = await getInfisicalSecret({ projectId, token, environment, secretPath, name });
	if (existing && constantTimeEqual(existing, value)) return;
	const method = existing ? "PATCH" : "POST";
	await requestJson(`${infisicalApiBaseUrl}/api/v4/secrets/${encodeURIComponent(name)}`, {
		method,
		headers: _headers(token),
		body: {
			projectId,
			environment,
			secretPath,
			secretValue: value,
			skipMultilineEncoding: true,
			type: "shared",
		},
		acceptedStatuses: method === "POST" ? [200, 201] : [200],
	});
}

export async function deleteInfisicalSecret({ projectId, token, environment, secretPath, name }) {
	const existing = await getInfisicalSecret({ projectId, token, environment, secretPath, name });
	if (!existing) return;
	await requestJson(`${infisicalApiBaseUrl}/api/v4/secrets/${encodeURIComponent(name)}`, {
		method: "DELETE",
		headers: _headers(token),
		body: { projectId, environment, secretPath, type: "shared" },
		acceptedStatuses: [200],
	});
}

export function getBootstrapSecret({ projectId, token, environment, name }) {
	return getInfisicalSecret({ projectId, token, environment, secretPath: bootstrapSecretPath, name });
}

export function setBootstrapSecret({ projectId, token, environment, name, value }) {
	return setInfisicalSecret({
		projectId,
		token,
		environment,
		secretPath: bootstrapSecretPath,
		name,
		value,
	});
}

export function deleteBootstrapSecret({ projectId, token, environment, name }) {
	return deleteInfisicalSecret({
		projectId,
		token,
		environment,
		secretPath: bootstrapSecretPath,
		name,
	});
}

async function _ensureFolder({ projectId, token, environment, path, name }) {
	const query = new URLSearchParams({
		projectId,
		environment,
		path,
		recursive: "false",
	});
	const url = `${infisicalApiBaseUrl}/api/v2/folders?${query}`;
	await reconcileInfisicalFolderState({
		name: name,
		listFolders: async () => (await requestJson(url, { headers: _headers(token) })).folders,
		createFolder: () =>
			requestJson(`${infisicalApiBaseUrl}/api/v2/folders`, {
				method: "POST",
				headers: _headers(token),
				body: { projectId: projectId, environment: environment, path: path, name: name },
				acceptedStatuses: [200, 201],
			}),
	});
}

export async function ensureBootstrapFolders(projectId, infisicalToken) {
	for (const environment of ENVIRONMENTS) {
		await _ensureFolder({ projectId, token: infisicalToken, environment, path: "/", name: "opentofu" });
		await _ensureFolder({ projectId, token: infisicalToken, environment, path: "/opentofu", name: "bootstrap" });
	}
}

export async function ensureManualSecrets({ manifest, projectId, infisicalToken }) {
	await reconcileInfisicalManualSecrets({
		manifest: manifest,
		ensureSecret: ({ environment, secretPath, name }) => {
			const query = new URLSearchParams({
				projectId: projectId,
				environment: environment,
				secretPath: secretPath,
				viewSecretValue: "false",
				expandSecretReferences: "false",
				recursive: "false",
				includeImports: "false",
				includePersonalOverrides: "false",
			});
			return reconcileInfisicalSecretPlaceholder({
				name: name,
				listSecrets: async () =>
					(
						await requestJson(`${infisicalApiBaseUrl}/api/v4/secrets?${query}`, {
							headers: _headers(infisicalToken),
						})
					).secrets,
				createSecret: ({ value }) =>
					requestJson(`${infisicalApiBaseUrl}/api/v4/secrets/${encodeURIComponent(name)}`, {
						method: "POST",
						headers: _headers(infisicalToken),
						body: {
							projectId: projectId,
							environment: environment,
							secretPath: secretPath,
							secretValue: value,
							type: "shared",
							skipMultilineEncoding: true,
						},
						acceptedStatuses: [200, 201],
					}),
			});
		},
	});
}

export async function applyGeneratedFolders(infisicalProjectId, infisicalToken) {
	const root = join(repositoryRoot, "infrastructure/opentofu/roots/infisical-generated-folders");
	for (const environment of ENVIRONMENTS) {
		const accessKeyId = await getBootstrapSecret({
			projectId: infisicalProjectId,
			token: infisicalToken,
			environment,
			name: "R2_STATE_ACCESS_KEY_ID",
		});
		const secretAccessKey = await getBootstrapSecret({
			projectId: infisicalProjectId,
			token: infisicalToken,
			environment,
			name: "R2_STATE_SECRET_ACCESS_KEY",
		});
		if (!accessKeyId || !secretAccessKey) {
			throw new Error(`Missing ${environment} R2 backend credentials before generated-folder reconciliation.`);
		}

		const environmentVariables = {
			...process.env,
			AWS_ACCESS_KEY_ID: accessKeyId,
			AWS_SECRET_ACCESS_KEY: secretAccessKey,
			INFISICAL_TOKEN: infisicalToken,
			TF_IN_AUTOMATION: "1",
		};
		delete environmentVariables.INFISICAL_AUTH_JWT;
		delete environmentVariables.INFISICAL_AUTH_METHOD;
		delete environmentVariables.INFISICAL_MACHINE_IDENTITY_ID;

		await runAsync(
			"tofu",
			[
				"init",
				"-reconfigure",
				"-input=false",
				"-backend-config=../../backends/r2.s3.tfbackend",
				`-backend-config=../../environments/${environment}/infisical-generated-folders.s3.tfbackend`,
			],
			{ cwd: root, env: environmentVariables },
		);

		const planPath = join(
			tmpdir(),
			`cataqui-bootstrap-infisical-generated-folders-${environment}-${randomUUID()}.tfplan`,
		);
		try {
			await runAsync(
				"tofu",
				["plan", "-input=false", "-lock-timeout=5m", `-var=environment=${environment}`, "-out", planPath],
				{
					cwd: root,
					env: environmentVariables,
				},
			);
			await runAsync("tofu", ["apply", "-input=false", "-lock-timeout=5m", planPath], {
				cwd: root,
				env: environmentVariables,
			});
		} finally {
			if (existsSync(planPath)) unlinkSync(planPath);
		}
	}
}

export async function reconcileInfisicalIdentity({
	manifest,
	projectId,
	infisicalToken,
	environment,
	githubOidcSubjectPrefix,
}) {
	const apiUrl = infisicalApiBaseUrl;
	const headers = _headers(infisicalToken);
	const name = manifest.infisical.opentofu_identities[`cataqui_backend_${environment}`];
	const search = new URLSearchParams({ search: name, limit: "100", offset: "0" });
	const listed = await requestJson(`${apiUrl}/api/v1/projects/${projectId}/identities?${search}`, {
		headers,
	});
	let identity = resolveUniqueNamedResource(listed.identities ?? [], name);
	if (!identity) {
		let created;
		try {
			created = await requestJson(`${apiUrl}/api/v1/projects/${projectId}/identities`, {
				method: "POST",
				headers,
				body: { name, hasDeleteProtection: true, metadata: [] },
				acceptedStatuses: [200, 201],
			});
		} catch (error) {
			throw explainInfisicalIdentityCreationFailure(error, environment);
		}
		identity = created.identity;
	}
	const identityId = identity.id;
	if (!identity.hasDeleteProtection) {
		await requestJson(`${apiUrl}/api/v1/projects/${projectId}/identities/${identityId}`, {
			method: "PATCH",
			headers,
			body: {
				name,
				hasDeleteProtection: true,
				metadata: (identity.metadata ?? []).map((item) => ({ key: item.key, value: item.value })),
			},
			acceptedStatuses: [200],
		});
	}

	const expectedSubject = `${githubOidcSubjectPrefix}:environment:${environment}`;
	const oidcUrl = `${apiUrl}/api/v1/auth/oidc-auth/identities/${identityId}`;
	const existingOidc = await fetch(oidcUrl, { headers: { accept: "application/json", ...headers } });
	const existingOidcPayload = await existingOidc.json().catch(() => undefined);
	let oidcInspection;
	try {
		oidcInspection = classifyInfisicalOidcInspection({ status: existingOidc.status, payload: existingOidcPayload });
	} catch {
		throw new Error(`Unable to inspect Infisical OIDC trust for ${environment} (${existingOidc.status}).`);
	}
	let existingOidcConfiguration;
	if (oidcInspection === "present") {
		existingOidcConfiguration = existingOidcPayload.identityOidcAuth;
		if (
			existingOidcConfiguration.boundSubject !== expectedSubject ||
			existingOidcConfiguration.boundIssuer !== "https://token.actions.githubusercontent.com"
		) {
			throw new Error(`Foreign Infisical OIDC trust conflicts with ${name}.`);
		}
	}

	const membershipUrl = `${apiUrl}/api/v1/projects/${projectId}/memberships/identities/${identityId}`;
	const membership = (await requestJson(membershipUrl, { headers })).identityMembership;
	if (membership.roles?.length !== 1 || membership.roles[0].role !== "no-access" || membership.roles[0].isTemporary) {
		await requestJson(membershipUrl, {
			method: "PATCH",
			headers,
			body: { roles: [{ role: "no-access", isTemporary: false }] },
			acceptedStatuses: [200],
		});
	}

	const privilegeSlug = `opentofu-${environment}`;
	const privilegeQuery = new URLSearchParams({ identityId, projectSlug: manifest.infisical.project.slug });
	const privilegeList = await requestJson(`${apiUrl}/api/v1/additional-privilege/identity?${privilegeQuery}`, {
		headers,
	});
	if ((privilegeList.privileges ?? []).some((candidate) => candidate.slug !== privilegeSlug)) {
		throw new Error(`Infisical identity ${name} has privileges not owned by bootstrap.`);
	}
	let privilege = resolveInfisicalPrivilege(privilegeList.privileges ?? [], privilegeSlug);
	const environmentCondition = { $eq: environment };
	const permissions = [
		{
			subject: "secrets",
			action: ["describeSecret", "readValue"],
			conditions: { environment: environmentCondition, secretPath: { $eq: bootstrapSecretPath } },
		},
		{
			subject: "secrets",
			action: ["describeSecret", "readValue", "create", "edit"],
			conditions: { environment: environmentCondition, secretPath: { $glob: "/generated/**" } },
		},
		{
			subject: "secret-folders",
			action: ["read", "create"],
			conditions: { environment: environmentCondition, secretPath: { $eq: "/" } },
		},
		{
			subject: "secret-folders",
			action: ["read", "create", "edit"],
			conditions: { environment: environmentCondition, secretPath: { $glob: "/generated{,/**}" } },
		},
	];
	if (!privilege) {
		try {
			await requestJson(`${apiUrl}/api/v2/identity-project-additional-privilege`, {
				method: "POST",
				headers,
				body: {
					identityId,
					projectId,
					slug: privilegeSlug,
					permissions,
					type: { isTemporary: false },
				},
				acceptedStatuses: [200, 201],
			});
		} catch (error) {
			if (!isInfisicalPrivilegeAlreadyPresent(error, privilegeSlug)) throw error;
			const refreshed = await requestJson(`${apiUrl}/api/v1/additional-privilege/identity?${privilegeQuery}`, {
				headers,
			});
			privilege = resolveInfisicalPrivilege(refreshed.privileges ?? [], privilegeSlug);
			if (!privilege) throw error;
		}
	}
	if (
		privilege &&
		(privilege.isTemporary ||
			_stableJson(_normalizePermissions(privilege.permissions)) !== _stableJson(_normalizePermissions(permissions)))
	) {
		await requestJson(`${apiUrl}/api/v2/identity-project-additional-privilege/${privilege.id}`, {
			method: "PATCH",
			headers,
			body: { slug: privilegeSlug, permissions, type: { isTemporary: false } },
			acceptedStatuses: [200, 201],
		});
	}

	const desiredOidc = {
		oidcDiscoveryUrl: "https://token.actions.githubusercontent.com",
		boundIssuer: "https://token.actions.githubusercontent.com",
		boundAudiences: "https://github.com/Cataqui",
		boundSubject: expectedSubject,
		boundClaims: {},
		accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
		accessTokenTTL: 3600,
		accessTokenMaxTTL: 3600,
		accessTokenNumUsesLimit: 0,
	};
	const oidcHasDrift =
		oidcInspection === "missing" ||
		Object.entries(desiredOidc).some(
			([key, value]) => _stableJson(existingOidcConfiguration?.[key]) !== _stableJson(value),
		);
	if (oidcHasDrift) {
		await requestJson(oidcUrl, {
			method: oidcInspection === "missing" ? "POST" : "PATCH",
			headers,
			body: desiredOidc,
			acceptedStatuses: [200, 201],
		});
	}
	const verifiedOidc = (await requestJson(oidcUrl, { headers })).identityOidcAuth;
	if (
		verifiedOidc.boundSubject !== expectedSubject ||
		verifiedOidc.boundIssuer !== "https://token.actions.githubusercontent.com" ||
		verifiedOidc.boundAudiences !== "https://github.com/Cataqui"
	) {
		throw new Error(`Infisical OIDC verification failed for ${environment}.`);
	}
	const verifiedPrivileges = await requestJson(`${apiUrl}/api/v1/additional-privilege/identity?${privilegeQuery}`, {
		headers,
	});
	if (verifiedPrivileges.privileges?.length !== 1 || verifiedPrivileges.privileges[0].slug !== privilegeSlug) {
		throw new Error(`Infisical privilege verification failed for ${environment}.`);
	}
	return identityId;
}
