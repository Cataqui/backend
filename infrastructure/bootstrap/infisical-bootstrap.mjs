import { constantTimeEqual, ENVIRONMENTS, resolveUniqueNamedResource } from "./reconciliation.mjs";
import { knownSecrets, requestJson } from "./bootstrap-runtime.mjs";
import { INFISICAL_PROJECT_TYPE, reconcileInfisicalProjectState } from "./infisical-reconciliation.mjs";

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

export async function reconcileInfisicalProject(platforms, infisicalToken, { request = requestJson } = {}) {
	const expectedOrganizationId = platforms.infisical.organization_id;
	const expectedName = platforms.infisical.project.name;
	const expectedSlug = platforms.infisical.project.slug;
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

export async function getBootstrapSecret({ projectId, token, environment, name }) {
	const query = new URLSearchParams({
		projectId,
		environment,
		secretPath: bootstrapSecretPath,
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

export async function setBootstrapSecret({ projectId, token, environment, name, value }) {
	knownSecrets.add(value);
	const existing = await getBootstrapSecret({ projectId, token, environment, name });
	if (existing && constantTimeEqual(existing, value)) return;
	const method = existing ? "PATCH" : "POST";
	await requestJson(`${infisicalApiBaseUrl}/api/v4/secrets/${encodeURIComponent(name)}`, {
		method,
		headers: _headers(token),
		body: {
			projectId,
			environment,
			secretPath: bootstrapSecretPath,
			secretValue: value,
			skipMultilineEncoding: true,
			type: "shared",
		},
		acceptedStatuses: method === "POST" ? [200, 201] : [200],
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
	const payload = await requestJson(url, { headers: _headers(token) });
	if ((payload.folders ?? []).some((folder) => folder.name === name)) return;
	await requestJson(`${infisicalApiBaseUrl}/api/v2/folders`, {
		method: "POST",
		headers: _headers(token),
		body: { projectId, environment, path, name },
		acceptedStatuses: [200, 201],
	});
}

export async function ensureBootstrapFolders(projectId, infisicalToken) {
	for (const environment of ENVIRONMENTS) {
		await _ensureFolder({ projectId, token: infisicalToken, environment, path: "/", name: "opentofu" });
		await _ensureFolder({ projectId, token: infisicalToken, environment, path: "/opentofu", name: "bootstrap" });
	}
}

export async function reconcileInfisicalIdentity({ platforms, projectId, infisicalToken, environment }) {
	const apiUrl = infisicalApiBaseUrl;
	const headers = _headers(infisicalToken);
	const name = platforms.infisical.opentofu_identities[`cataqui_backend_${environment}`];
	const search = new URLSearchParams({ search: name, limit: "100", offset: "0" });
	const listed = await requestJson(`${apiUrl}/api/v1/projects/${projectId}/identities?${search}`, {
		headers,
	});
	let identity = resolveUniqueNamedResource(listed.identities ?? [], name);
	if (!identity) {
		const created = await requestJson(`${apiUrl}/api/v1/projects/${projectId}/identities`, {
			method: "POST",
			headers,
			body: { name, hasDeleteProtection: true, metadata: [] },
			acceptedStatuses: [200, 201],
		});
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

	const expectedSubject = `repo:${platforms.github.repository}:environment:${environment}`;
	const oidcUrl = `${apiUrl}/api/v1/auth/oidc-auth/identities/${identityId}`;
	const existingOidc = await fetch(oidcUrl, { headers: { accept: "application/json", ...headers } });
	if (existingOidc.status !== 404 && !existingOidc.ok)
		throw new Error(`Unable to inspect Infisical OIDC trust for ${environment}.`);
	let existingOidcConfiguration;
	if (existingOidc.ok) {
		existingOidcConfiguration = (await existingOidc.json()).identityOidcAuth;
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
	const privilegeQuery = new URLSearchParams({ identityId, projectSlug: platforms.infisical.project.slug });
	const privilegeList = await requestJson(`${apiUrl}/api/v1/additional-privilege/identity?${privilegeQuery}`, {
		headers,
	});
	if ((privilegeList.privileges ?? []).some((candidate) => candidate.slug !== privilegeSlug)) {
		throw new Error(`Infisical identity ${name} has privileges not owned by bootstrap.`);
	}
	const privilege = resolveUniqueNamedResource(privilegeList.privileges ?? [], privilegeSlug, () => true);
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
	if (
		!privilege ||
		privilege.isTemporary ||
		_stableJson(_normalizePermissions(privilege.permissions)) !== _stableJson(_normalizePermissions(permissions))
	) {
		await requestJson(`${apiUrl}/api/v2/identity-project-additional-privilege${privilege ? `/${privilege.id}` : ""}`, {
			method: privilege ? "PATCH" : "POST",
			headers,
			body: privilege
				? { slug: privilegeSlug, permissions, type: { isTemporary: false } }
				: {
						identityId,
						projectId,
						slug: privilegeSlug,
						permissions,
						type: { isTemporary: false },
					},
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
		existingOidc.status === 404 ||
		Object.entries(desiredOidc).some(
			([key, value]) => _stableJson(existingOidcConfiguration?.[key]) !== _stableJson(value),
		);
	if (oidcHasDrift) {
		await requestJson(oidcUrl, {
			method: existingOidc.status === 404 ? "POST" : "PATCH",
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
