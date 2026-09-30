import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	classifyCredentialResponse,
	decideR2Credentials,
	getR2TokenName,
} from "../infrastructure/bootstrap/cloudflare-reconciliation.mjs";
import {
	classifyDatadogCredentialResponse,
	DATADOG_OPENTOFU_SCOPES,
	decideDatadogApplicationKeyScopes,
	decideDatadogCredentials,
	isSupportedPupVersion,
	reconcileDatadogEnvironmentCredentials,
	resolveDatadogApiKey,
	resolveDatadogRole,
	resolveDatadogServiceAccount,
} from "../infrastructure/bootstrap/datadog-reconciliation.mjs";
import {
	classifyGoogleProjectDiscovery,
	decideGoogleProject,
} from "../infrastructure/bootstrap/google-cloud-reconciliation.mjs";
import { parseGithubOidcSubjectPrefix } from "../infrastructure/bootstrap/github-reconciliation.mjs";
import { decideMetaAppSecret, reconcileMetaAppSecretState } from "../infrastructure/bootstrap/meta-reconciliation.mjs";
import {
	assertInfisicalOrganizationScope,
	assertInfisicalProjectContract,
	classifyInfisicalOidcInspection,
	decideInfisicalProject,
	explainInfisicalIdentityCreationFailure,
	getMissingInfisicalEnvironments,
	isInfisicalPrivilegeAlreadyPresent,
	resolveInfisicalPrivilege,
	reconcileInfisicalProjectState,
} from "../infrastructure/bootstrap/infisical-reconciliation.mjs";
import {
	classifyNeonCredentialResponse,
	decideNeonAccountCredential,
	getNeonAccountApiKeyName,
	getNeonProjectApiKeyName,
	normalizeCreatedNeonAccountApiKey,
	reconcileNeonAccountCredential,
} from "../infrastructure/bootstrap/neon-reconciliation.mjs";
import {
	constantTimeEqual,
	redactSecrets,
	resolveUniqueNamedResource,
	validateManifest,
	validatePlatforms,
} from "../infrastructure/bootstrap/reconciliation.mjs";
import {
	classifyUpstashCredentialResponse,
	decideUpstashCredential,
	reconcileUpstashCredential,
} from "../infrastructure/bootstrap/upstash-reconciliation.mjs";

const platformCoordinates = JSON.parse(readFileSync(resolve(process.cwd(), "infrastructure/platforms.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "infrastructure/manifest.json"), "utf8"));
const platforms = {
	...platformCoordinates,
	infisical: { ...platformCoordinates.infisical, project: manifest.infisical.project },
};

describe("infrastructure bootstrap reconciliation", () => {
	it("accepts only the configured repository's immutable GitHub OIDC subject prefix", () => {
		expect(
			parseGithubOidcSubjectPrefix("Cataqui/backend", {
				sub_claim_prefix: "repo:Cataqui@288484515/backend@1252587238",
			}),
		).toBe("repo:Cataqui@288484515/backend@1252587238");
		expect(() =>
			parseGithubOidcSubjectPrefix("Cataqui/backend", {
				sub_claim_prefix: "repo:Cataqui/backend",
			}),
		).toThrow("invalid immutable OIDC subject prefix");
		expect(() =>
			parseGithubOidcSubjectPrefix("Cataqui/backend", {
				sub_claim_prefix: "repo:Foreign@288484515/backend@1252587238",
			}),
		).toThrow("invalid immutable OIDC subject prefix");
		expect(() => parseGithubOidcSubjectPrefix("Cataqui/backend", undefined)).toThrow(
			"invalid immutable OIDC subject prefix",
		);
	});

	it("accepts the committed stable bootstrap contract", () => {
		expect(validatePlatforms(platformCoordinates)).toBe(platformCoordinates);
		expect(validateManifest(manifest)).toBe(manifest);
		expect(manifest.cloudflare.r2.buckets).toEqual({ opentofu_state: "cataqui-backend-opentofu-state" });
		expect(manifest.cloudflare.ai_gateways).toEqual({
			derive_job_data_staging: "cataqui-derive-job-data-staging",
			derive_job_data_production: "cataqui-derive-job-data-production",
		});
		expect(getR2TokenName(manifest, "staging")).toBe("cataqui-backend-opentofu-state-staging");
		expect(getR2TokenName(manifest, "production")).toBe("cataqui-backend-opentofu-state-production");
		expect(manifest.google_cloud.projects).toEqual({
			cataqui_staging: { name: "cataqui-staging", id: "cataqui-staging-mre5wge" },
			cataqui_production: { name: "cataqui-production", id: "cataqui-production-jd7bfto" },
		});
		expect(manifest.google_cloud.github_auth.service_accounts).toEqual({
			cataqui_backend_staging: "cataqui-backend-opentofu-stg",
			cataqui_backend_production: "cataqui-backend-opentofu-prod",
		});
		expect(manifest.infisical.opentofu_identities).toEqual({
			cataqui_backend_staging: "cataqui-backend-opentofu-staging",
			cataqui_backend_production: "cataqui-backend-opentofu-production",
		});
		expect(platformCoordinates.infisical.organization_id).toBe("33687647-d8e9-44a7-9cb9-721bd5b28a45");
		expect(manifest.infisical.project).toEqual({
			name: "Cataquí Backend",
			slug: "cataqui-backend-6xt3g",
		});
		expect(manifest.github.environments).toEqual({
			staging: { branches: ["staging"] },
			production: { branches: ["main"] },
		});
		expect(platformCoordinates.upstash).toEqual({ account_email: "ryan@ventairy.com" });
		expect(platformCoordinates.datadog).toEqual({ site: "us5.datadoghq.com" });
		expect(manifest.datadog.api_keys).toEqual({
			cataqui_api_staging: { name: "cataqui-api-staging" },
			cataqui_api_production: { name: "cataqui-api-production" },
		});
		expect(manifest.upstash.redis.databases).toEqual({
			cataqui_api_staging: { name: "cataqui-api-staging" },
			cataqui_api_production: { name: "cataqui-api-production" },
		});
		expect(manifest.neon.projects).toEqual({
			cataqui_staging: { name: "cataqui-staging" },
			cataqui_production: { name: "cataqui-production" },
		});
		expect(manifest.neon.api_keys).toEqual({
			account_bootstrap: { name: "cataqui-backend-opentofu-bootstrap" },
			project_access: {
				cataqui_staging: { name: "cataqui-backend-project-access-staging" },
				cataqui_production: { name: "cataqui-backend-project-access-production" },
			},
		});
		expect(manifest.neon.databases).toEqual({
			cataqui: { name: "cataqui", owner_role: "db_owner", runtime_role: "db_user" },
		});
	});

	it("rejects invalid and unexpected external platform values", () => {
		expect(() =>
			validatePlatforms({
				...platformCoordinates,
				cloudflare: { ...platformCoordinates.cloudflare, account_id: "secret" },
			}),
		).toThrow("cloudflare.account_id");
		expect(() =>
			validatePlatforms({
				...platformCoordinates,
				infisical: { ...platformCoordinates.infisical, api_url: "https://example.com" },
			}),
		).toThrow("Unexpected keys in infrastructure configuration object: platforms.infisical");
		expect(() =>
			validatePlatforms({
				...platformCoordinates,
				google_cloud: { ...platformCoordinates.google_cloud, project_id: "forbidden" },
			}),
		).toThrow("Unexpected keys in infrastructure configuration object: platforms.google_cloud");
		expect(() => validatePlatforms({ ...platformCoordinates, upstash: { account_email: "not-an-email" } })).toThrow(
			"upstash.account_email",
		);
		expect(() =>
			validatePlatforms({
				...platformCoordinates,
				upstash: { ...platformCoordinates.upstash, api_key: "forbidden" },
			}),
		).toThrow("Unexpected keys in infrastructure configuration object: platforms.upstash");
		expect(() => validatePlatforms({ ...platformCoordinates, datadog: { site: "https://us5.datadoghq.com" } })).toThrow(
			"datadog.site",
		);
		expect(() =>
			validatePlatforms({ ...platformCoordinates, datadog: { ...platformCoordinates.datadog, api_key: "forbidden" } }),
		).toThrow("Unexpected keys in infrastructure configuration object: platforms.datadog");
		expect(() =>
			validateManifest({
				...manifest,
				datadog: {
					...manifest.datadog,
					api_keys: { ...manifest.datadog.api_keys, cataqui_api_development: { name: "cataqui-api-dev" } },
				},
			}),
		).toThrow("Unexpected keys in infrastructure configuration object: manifest.datadog.api_keys");
		expect(() =>
			validateManifest({
				...manifest,
				datadog: {
					...manifest.datadog,
					opentofu: {
						...manifest.datadog.opentofu,
						service_account: { ...manifest.datadog.opentofu.service_account, email: "not-an-email" },
					},
				},
			}),
		).toThrow("datadog.opentofu.service_account.email");
	});

	it("rejects invalid and unexpected desired infrastructure values", () => {
		expect(() =>
			validateManifest({
				...manifest,
				google_cloud: {
					...manifest.google_cloud,
					projects: { ...manifest.google_cloud.projects, legacy_id: "legacy" },
				},
			}),
		).toThrow("Unexpected keys");
		expect(() => validateManifest({ ...manifest, github: { ...manifest.github, environments: undefined } })).toThrow(
			"Invalid infrastructure configuration object",
		);
		expect(() =>
			validateManifest({
				...manifest,
				infisical: {
					...manifest.infisical,
					project: { ...manifest.infisical.project, id: randomUUID() },
				},
			}),
		).toThrow("manifest.infisical.project");
		expect(() =>
			validateManifest({
				...manifest,
				cloudflare: { ...manifest.cloudflare, api_token: "forbidden" },
			}),
		).toThrow("manifest.cloudflare");
		expect(() =>
			validateManifest({
				...manifest,
				github: {
					...manifest.github,
					environments: { ...manifest.github.environments, staging: { branches: [] } },
				},
			}),
		).toThrow("Invalid branch policy");
	});

	it("creates or reuses the exact Infisical project by stable slug", () => {
		const expected = {
			expectedOrganizationId: platforms.infisical.organization_id,
			expectedName: platforms.infisical.project.name,
			expectedSlug: platforms.infisical.project.slug,
		};
		expect(decideInfisicalProject({ projects: [], ...expected })).toEqual({ action: "create" });
		const project = {
			id: "project-id",
			orgId: expected.expectedOrganizationId,
			name: expected.expectedName,
			slug: expected.expectedSlug,
			type: "secret-manager",
			hasDeleteProtection: true,
			environments: [] as Array<{ name: string; slug: string; position: number }>,
		};
		expect(decideInfisicalProject({ projects: [project], ...expected })).toEqual({ action: "reuse", project });
		expect(
			decideInfisicalProject({ projects: [{ ...project, name: "Drifted", hasDeleteProtection: false }], ...expected }),
		).toMatchObject({ action: "reconcile" });
	});

	it("recognizes Infisical's exact missing-OIDC response without hiding other failures", () => {
		expect(classifyInfisicalOidcInspection({ status: 200, payload: {} })).toBe("present");
		expect(classifyInfisicalOidcInspection({ status: 404, payload: {} })).toBe("missing");
		expect(
			classifyInfisicalOidcInspection({
				status: 400,
				payload: { message: "The identity does not have OIDC Auth attached" },
			}),
		).toBe("missing");
		expect(() => classifyInfisicalOidcInspection({ status: 400, payload: { message: "Invalid identity" } })).toThrow(
			"Unable to inspect Infisical OIDC trust (400)",
		);
		expect(() => classifyInfisicalOidcInspection({ status: 403, payload: {} })).toThrow(
			"Unable to inspect Infisical OIDC trust (403)",
		);
	});

	it("explains exhausted Infisical identity capacity without weakening environment isolation", () => {
		expect(() => {
			throw explainInfisicalIdentityCreationFailure(
				new Error("Failed to create identity due to identity limit reached. Upgrade plan to create more identities."),
				"production",
			);
		}).toThrow(
			"Infisical identity capacity is exhausted. The production environment requires its own OIDC identity to preserve staging and production isolation.",
		);
		const providerError = new Error("Infisical request failed with 503.");
		expect(explainInfisicalIdentityCreationFailure(providerError, "staging")).toBe(providerError);
	});

	it("recognizes only the exact Infisical additional-privilege conflict", () => {
		expect(
			isInfisicalPrivilegeAlreadyPresent(
				new Error("Additional privilege with name opentofu-staging exists"),
				"opentofu-staging",
			),
		).toBe(true);
		expect(isInfisicalPrivilegeAlreadyPresent(new Error("Permission denied"), "opentofu-staging")).toBe(false);
	});

	it("resolves Infisical additional privileges by slug", () => {
		const privilege = { id: "privilege-id", slug: "opentofu-staging" };
		expect(resolveInfisicalPrivilege([privilege], "opentofu-staging")).toBe(privilege);
		expect(resolveInfisicalPrivilege([], "opentofu-staging")).toBeUndefined();
		expect(() => resolveInfisicalPrivilege([privilege, { ...privilege, id: "duplicate" }], "opentofu-staging")).toThrow(
			"Duplicate Infisical privileges use slug opentofu-staging",
		);
	});

	it("repairs missing Infisical environments while preserving additional ones", () => {
		const project = {
			environments: [{ slug: "staging" }, { slug: "development" }],
		};
		expect(getMissingInfisicalEnvironments(project)).toEqual(["production"]);
		expect(
			getMissingInfisicalEnvironments({
				environments: [...project.environments, { slug: "production" }],
			}),
		).toEqual([]);
	});

	it("fails closed for ambiguous or foreign Infisical project ownership", () => {
		const expected = {
			expectedOrganizationId: platforms.infisical.organization_id,
			expectedName: platforms.infisical.project.name,
			expectedSlug: platforms.infisical.project.slug,
		};
		const project = {
			id: "project-id",
			orgId: expected.expectedOrganizationId,
			name: expected.expectedName,
			slug: expected.expectedSlug,
			type: "secret-manager",
			hasDeleteProtection: true,
			environments: [],
		};
		expect(() => decideInfisicalProject({ projects: [project, { ...project, id: "duplicate" }], ...expected })).toThrow(
			"Duplicate Infisical projects",
		);
		expect(() => decideInfisicalProject({ projects: [{ ...project, orgId: randomUUID() }], ...expected })).toThrow(
			"foreign organization",
		);
		expect(() => decideInfisicalProject({ projects: [{ ...project, type: "kms" }], ...expected })).toThrow(
			"not a secret-manager",
		);
		expect(() => assertInfisicalOrganizationScope([], expected.expectedOrganizationId)).toThrow(
			"not scoped exclusively",
		);
		expect(() =>
			assertInfisicalOrganizationScope([project, { ...project, orgId: randomUUID() }], expected.expectedOrganizationId),
		).toThrow("not scoped exclusively");
		expect(() => getMissingInfisicalEnvironments({ environments: [{ slug: "staging" }, { slug: "staging" }] })).toThrow(
			"Duplicate Infisical environment",
		);
	});

	it("verifies the final Infisical project contract after interrupted reconciliation", () => {
		const expected = {
			expectedOrganizationId: platforms.infisical.organization_id,
			expectedName: platforms.infisical.project.name,
			expectedSlug: platforms.infisical.project.slug,
		};
		const project = {
			id: "project-id",
			orgId: expected.expectedOrganizationId,
			name: expected.expectedName,
			slug: expected.expectedSlug,
			type: "secret-manager",
			hasDeleteProtection: true,
			environments: [{ slug: "staging" }, { slug: "production" }, { slug: "development" }],
		};
		expect(assertInfisicalProjectContract({ project, ...expected })).toBe(project);
		expect(() =>
			assertInfisicalProjectContract({ project: { ...project, environments: [{ slug: "staging" }] }, ...expected }),
		).toThrow("failed final verification");
	});

	it("creates the Infisical project and both environments in dependency order", async () => {
		const existingProject = {
			id: "existing-project",
			orgId: platforms.infisical.organization_id,
			name: "Existing",
			slug: "existing",
			type: "secret-manager",
			hasDeleteProtection: true,
			environments: [],
		};
		const createdProject = {
			id: "created-project",
			orgId: platforms.infisical.organization_id,
			name: platforms.infisical.project.name,
			slug: platforms.infisical.project.slug,
			type: "secret-manager",
			hasDeleteProtection: true,
			environments: [] as Array<{ name: string; slug: string; position: number }>,
		};
		const events: string[] = [];
		await expect(
			reconcileInfisicalProjectState({
				expectedOrganizationId: platforms.infisical.organization_id,
				expectedName: platforms.infisical.project.name,
				expectedSlug: platforms.infisical.project.slug,
				listProjects: async () => {
					events.push("list");
					return [existingProject, ...(events.length > 1 ? [createdProject] : [])];
				},
				createProject: async () => {
					events.push("create-project");
					return createdProject;
				},
				updateProject: async () => {
					throw new Error("unexpected update");
				},
				createEnvironment: async ({ environment }) => {
					events.push(`create-environment:${environment}`);
					createdProject.environments.push({
						name: environment === "staging" ? "Staging" : "Production",
						slug: environment,
						position: environment === "staging" ? 1 : 2,
					});
				},
			}),
		).resolves.toBe("created-project");
		expect(createdProject.environments.map((environment) => environment.slug)).toEqual(["staging", "production"]);
		expect(events).toEqual([
			"list",
			"create-project",
			"list",
			"create-environment:staging",
			"create-environment:production",
			"list",
		]);
	});

	it("finishes an interrupted Infisical project and repairs mutable drift", async () => {
		const project = {
			id: "project-id",
			orgId: platforms.infisical.organization_id,
			name: "Drifted name",
			slug: platforms.infisical.project.slug,
			type: "secret-manager",
			hasDeleteProtection: false,
			environments: [{ slug: "staging" }],
		};
		const events: string[] = [];
		await expect(
			reconcileInfisicalProjectState({
				expectedOrganizationId: platforms.infisical.organization_id,
				expectedName: platforms.infisical.project.name,
				expectedSlug: platforms.infisical.project.slug,
				listProjects: async () => [project],
				createProject: async () => {
					throw new Error("unexpected create");
				},
				updateProject: async () => {
					events.push("update");
					project.name = platforms.infisical.project.name;
					project.hasDeleteProtection = true;
					return project;
				},
				createEnvironment: async ({ environment }) => {
					events.push(`environment:${environment}`);
					project.environments.push({ slug: environment });
				},
			}),
		).resolves.toBe("project-id");
		expect(events).toEqual(["update", "environment:production"]);
	});

	it("performs no Infisical writes for a healthy project and propagates inspection failures", async () => {
		const project = {
			id: "project-id",
			orgId: platforms.infisical.organization_id,
			name: platforms.infisical.project.name,
			slug: platforms.infisical.project.slug,
			type: "secret-manager",
			hasDeleteProtection: true,
			environments: [{ slug: "staging" }, { slug: "production" }],
		};
		const events: string[] = [];
		await expect(
			reconcileInfisicalProjectState({
				expectedOrganizationId: platforms.infisical.organization_id,
				expectedName: platforms.infisical.project.name,
				expectedSlug: platforms.infisical.project.slug,
				listProjects: async () => {
					events.push("list");
					return [project];
				},
				createProject: async () => events.push("create"),
				updateProject: async () => events.push("update"),
				createEnvironment: async () => events.push("environment"),
			}),
		).resolves.toBe("project-id");
		expect(events).toEqual(["list", "list"]);

		await expect(
			reconcileInfisicalProjectState({
				expectedOrganizationId: platforms.infisical.organization_id,
				expectedName: platforms.infisical.project.name,
				expectedSlug: platforms.infisical.project.slug,
				listProjects: async () => {
					throw new Error("GET /api/v1/projects failed with 401");
				},
				createProject: async () => undefined,
				updateProject: async () => undefined,
				createEnvironment: async () => undefined,
			}),
		).rejects.toThrow("failed with 401");
		await expect(
			reconcileInfisicalProjectState({
				expectedOrganizationId: platforms.infisical.organization_id,
				expectedName: platforms.infisical.project.name,
				expectedSlug: platforms.infisical.project.slug,
				listProjects: async () => {
					throw new Error("GET /api/v1/projects failed with 503");
				},
				createProject: async () => undefined,
				updateProject: async () => undefined,
				createEnvironment: async () => undefined,
			}),
		).rejects.toThrow("failed with 503");
	});

	it.each([
		[200, "accepted"],
		[204, "accepted"],
		[401, "rejected"],
		[403, "rejected"],
		[408, "indeterminate"],
		[429, "indeterminate"],
		[500, "indeterminate"],
	] as const)("classifies Upstash credential responses", (status, expected) => {
		expect(classifyUpstashCredentialResponse(status)).toBe(expected);
	});

	it("reuses a healthy shared Upstash key and repairs one missing environment", () => {
		const apiKey = randomUUID();
		expect(
			decideUpstashCredential({
				storedByEnvironment: { staging: apiKey, production: apiKey },
				credentialStatus: "accepted",
			}),
		).toEqual({ action: "reuse", writeEnvironments: [] });
		expect(
			decideUpstashCredential({
				storedByEnvironment: { staging: apiKey, production: undefined },
				credentialStatus: "accepted",
			}),
		).toEqual({ action: "reuse", writeEnvironments: ["production"] });
	});

	it("requests or replaces the shared Upstash key only when missing or rejected", () => {
		const apiKey = randomUUID();
		expect(
			decideUpstashCredential({
				storedByEnvironment: { staging: undefined, production: undefined },
				credentialStatus: "missing",
			}),
		).toEqual({ action: "request", writeEnvironments: ["staging", "production"] });
		expect(
			decideUpstashCredential({
				storedByEnvironment: { staging: apiKey, production: apiKey },
				credentialStatus: "rejected",
			}),
		).toEqual({ action: "replace", writeEnvironments: ["staging", "production"] });
	});

	it("fails closed for conflicting or indeterminate Upstash credentials", () => {
		expect(() =>
			decideUpstashCredential({
				storedByEnvironment: { staging: randomUUID(), production: randomUUID() },
				credentialStatus: "accepted",
			}),
		).toThrow("different Upstash bootstrap API keys");
		expect(() =>
			decideUpstashCredential({
				storedByEnvironment: { staging: randomUUID(), production: undefined },
				credentialStatus: "indeterminate",
			}),
		).toThrow("Unable to determine");
	});

	it("prompts once and writes both environments on first Upstash bootstrap", async () => {
		const apiKey = randomUUID();
		const events: string[] = [];
		await expect(
			reconcileUpstashCredential({
				storedByEnvironment: { staging: undefined, production: undefined },
				verifyKey: async (key) => (key === apiKey ? "accepted" : "rejected"),
				requestKey: async () => {
					events.push("prompt");
					return apiKey;
				},
				writeKey: async (environment) => events.push(`write:${environment}`),
			}),
		).resolves.toEqual({ action: "request", writtenEnvironments: ["staging", "production"] });
		expect(events).toEqual(["prompt", "write:staging", "write:production"]);
	});

	it("repairs or reuses healthy Upstash credentials without prompting or rotation", async () => {
		const apiKey = randomUUID();
		const events: string[] = [];
		const requestKey = async () => {
			events.push("prompt");
			return randomUUID();
		};
		await reconcileUpstashCredential({
			storedByEnvironment: { staging: apiKey, production: undefined },
			verifyKey: async () => "accepted",
			requestKey,
			writeKey: async (environment) => events.push(`write:${environment}`),
		});
		expect(events).toEqual(["write:production"]);
		events.length = 0;
		await reconcileUpstashCredential({
			storedByEnvironment: { staging: apiKey, production: apiKey },
			verifyKey: async () => "accepted",
			requestKey,
			writeKey: async (environment) => events.push(`write:${environment}`),
		});
		expect(events).toEqual([]);
	});

	it("replaces a rejected Upstash key but never writes after an indeterminate replacement check", async () => {
		const storedKey = randomUUID();
		const replacementKey = randomUUID();
		const events: string[] = [];
		await reconcileUpstashCredential({
			storedByEnvironment: { staging: storedKey, production: storedKey },
			verifyKey: async (key) => (key === storedKey ? "rejected" : "accepted"),
			requestKey: async () => replacementKey,
			writeKey: async (environment) => events.push(`write:${environment}`),
		});
		expect(events).toEqual(["write:staging", "write:production"]);

		events.length = 0;
		await expect(
			reconcileUpstashCredential({
				storedByEnvironment: { staging: storedKey, production: storedKey },
				verifyKey: async (key) => (key === storedKey ? "rejected" : "indeterminate"),
				requestKey: async () => replacementKey,
				writeKey: async (environment) => events.push(`write:${environment}`),
			}),
		).rejects.toThrow("Unable to verify the supplied Upstash bootstrap API key");
		expect(events).toEqual([]);

		await expect(
			reconcileUpstashCredential({
				storedByEnvironment: { staging: storedKey, production: storedKey },
				verifyKey: async () => "rejected",
				requestKey: async () => replacementKey,
				writeKey: async (environment) => events.push(`write:${environment}`),
			}),
		).rejects.toThrow("supplied Upstash bootstrap API key is invalid");
		expect(events).toEqual([]);
	});

	it.each([
		[200, "accepted"],
		[401, "rejected"],
		[403, "rejected"],
		[429, "indeterminate"],
		[500, "indeterminate"],
	] as const)("classifies Datadog credential responses", (status, expected) => {
		expect(classifyDatadogCredentialResponse(status)).toBe(expected);
	});

	it.each([
		["pup 1.18.0", true],
		["pup 1.23.4", true],
		["pup 2.0.0", true],
		["pup 1.17.9", false],
		["pup 0.99.0", false],
		["pup", false],
	] as const)("requires a pup release that can print its OAuth token (%s)", (versionOutput, expected) => {
		expect(isSupportedPupVersion(versionOutput)).toBe(expected);
	});

	it("resolves the committed OpenTofu identity from the manifest", () => {
		expect(manifest.datadog.opentofu).toEqual({
			service_account: { name: "cataqui-backend-opentofu", email: "cataqui-backend-opentofu@cataqui.com" },
			credentials: {
				staging: { name: "cataqui-backend-opentofu-staging" },
				production: { name: "cataqui-backend-opentofu-production" },
			},
		});
		expect(DATADOG_OPENTOFU_SCOPES).toEqual([
			"api_keys_read",
			"api_keys_write",
			"service_account_write",
			"user_access_read",
		]);
	});

	it("reuses only the enabled Datadog service account with the owned email", () => {
		const expected = manifest.datadog.opentofu.service_account;
		const owned = { id: "owned", name: expected.name, email: expected.email, disabled: false };
		expect(resolveDatadogServiceAccount([owned], expected)).toBe(owned);
		expect(resolveDatadogServiceAccount([], expected)).toBeUndefined();
		expect(() => resolveDatadogServiceAccount([{ ...owned, email: "someone@example.com" }], expected)).toThrow(
			"Foreign resource",
		);
		expect(() => resolveDatadogServiceAccount([{ ...owned, disabled: true }], expected)).toThrow("Foreign resource");
		expect(() => resolveDatadogServiceAccount([owned, { ...owned, id: "copy" }], expected)).toThrow("Duplicate");
	});

	it("requires exactly one matching Datadog role and API key name", () => {
		expect(resolveDatadogRole([{ id: "admin", name: "Datadog Admin Role" }], "Datadog Admin Role").id).toBe("admin");
		expect(() => resolveDatadogRole([], "Datadog Admin Role")).toThrow("does not exist");
		expect(
			resolveDatadogApiKey(
				[{ id: "key", name: "cataqui-backend-opentofu-staging" }],
				"cataqui-backend-opentofu-staging",
			)?.id,
		).toBe("key");
		expect(() =>
			resolveDatadogApiKey(
				[
					{ id: "a", name: "cataqui-backend-opentofu-staging" },
					{ id: "b", name: "cataqui-backend-opentofu-staging" },
				],
				"cataqui-backend-opentofu-staging",
			),
		).toThrow("Duplicate");
	});

	it("updates the scopes of the owned application key only when they drift", () => {
		const applicationKeys = [
			{ id: "current", last4: "abcd", scopes: [...DATADOG_OPENTOFU_SCOPES].reverse() },
			{ id: "other", last4: "wxyz", scopes: ["api_keys_read"] },
		];
		expect(
			decideDatadogApplicationKeyScopes({
				applicationKeys,
				storedAppKey: "secret-abcd",
				requiredScopes: DATADOG_OPENTOFU_SCOPES,
			}),
		).toEqual({ id: "current", needsUpdate: false });
		expect(
			decideDatadogApplicationKeyScopes({
				applicationKeys,
				storedAppKey: "secret-wxyz",
				requiredScopes: DATADOG_OPENTOFU_SCOPES,
			}),
		).toEqual({ id: "other", needsUpdate: true });
		expect(() =>
			decideDatadogApplicationKeyScopes({
				applicationKeys,
				storedAppKey: "secret-0000",
				requiredScopes: DATADOG_OPENTOFU_SCOPES,
			}),
		).toThrow("not exactly one owned key");
	});

	it("reuses accepted Datadog credentials and issues new ones when missing, partial, or rejected", () => {
		const stored = { apiKey: randomUUID(), appKey: randomUUID() };
		expect(decideDatadogCredentials({ stored, credentialStatus: "accepted" })).toEqual({ action: "reuse" });
		expect(decideDatadogCredentials({ stored, credentialStatus: "rejected" })).toEqual({ action: "issue" });
		expect(decideDatadogCredentials({ stored: { apiKey: stored.apiKey }, credentialStatus: "missing" })).toEqual({
			action: "issue",
		});
		expect(() => decideDatadogCredentials({ stored, credentialStatus: "indeterminate" })).toThrow(
			"Unable to determine",
		);
	});

	function _datadogCredentialHarness(options: { stored?: { apiKey?: string; appKey?: string }; verify: string[] }) {
		const events: string[] = [];
		const verifyResults = [...options.verify];
		return {
			events,
			params: {
				stored: options.stored,
				verifyCredentials: async () => {
					events.push("verify");
					return verifyResults.shift() ?? "accepted";
				},
				getOrCreateApiKey: async () => {
					events.push("api-key");
					return "api-key-value";
				},
				createApplicationKey: async () => {
					events.push("create-app-key");
					return { id: "new-app-key", key: "app-key-value" };
				},
				listApplicationKeys: async () => [{ id: "new-app-key" }, { id: "lost-app-key" }],
				deleteApplicationKey: async (id: string) => events.push(`delete:${id}`),
				writeCredentials: async () => events.push("write"),
				wait: async () => {
					events.push("wait");
				},
			},
		};
	}

	it("keeps working stored Datadog credentials without touching Datadog", async () => {
		const harness = _datadogCredentialHarness({ stored: { apiKey: "a", appKey: "b" }, verify: ["accepted"] });
		await expect(reconcileDatadogEnvironmentCredentials(harness.params)).resolves.toEqual({ action: "reuse" });
		expect(harness.events).toEqual(["verify"]);
	});

	it("stores newly issued Datadog credentials before removing lost same-named application keys", async () => {
		const harness = _datadogCredentialHarness({ stored: undefined, verify: ["accepted"] });
		await expect(reconcileDatadogEnvironmentCredentials(harness.params)).resolves.toEqual({
			action: "issue",
			deletedApplicationKeys: 1,
		});
		expect(harness.events).toEqual(["api-key", "create-app-key", "verify", "write", "delete:lost-app-key"]);
	});

	it("waits for a new application key to propagate before storing it", async () => {
		const harness = _datadogCredentialHarness({ stored: undefined, verify: ["rejected", "rejected", "accepted"] });
		await reconcileDatadogEnvironmentCredentials(harness.params);
		expect(harness.events).toEqual([
			"api-key",
			"create-app-key",
			"verify",
			"wait",
			"verify",
			"wait",
			"verify",
			"write",
			"delete:lost-app-key",
		]);
	});

	it("revokes a new application key that is still rejected after propagation and never stores it", async () => {
		const harness = _datadogCredentialHarness({
			stored: { apiKey: "a", appKey: "b" },
			verify: ["rejected", "rejected", "rejected", "rejected", "rejected", "rejected", "rejected"],
		});
		await expect(reconcileDatadogEnvironmentCredentials(harness.params)).rejects.toThrow("did not accept");
		expect(harness.events.filter((event) => event === "write")).toEqual([]);
		expect(harness.events.at(-1)).toBe("delete:new-app-key");
	});

	it("reuses one healthy owned resource and fails closed on duplicates or foreign ownership", () => {
		expect(
			resolveUniqueNamedResource(
				[{ id: "1", name: "expected", owner: "cataqui" }],
				"expected",
				(item) => item.owner === "cataqui",
			),
		).toEqual({ id: "1", name: "expected", owner: "cataqui" });
		expect(resolveUniqueNamedResource([], "expected")).toBeUndefined();
		expect(resolveUniqueNamedResource([{ id: "1", name: "expected" }], "expected")).toEqual({
			id: "1",
			name: "expected",
		});
		expect(() =>
			resolveUniqueNamedResource(
				[{ id: "1", name: "expected", owner: "foreign" }],
				"expected",
				(item) => item.owner === "cataqui",
			),
		).toThrow("Foreign resource");
		expect(() =>
			resolveUniqueNamedResource(
				[
					{ id: "1", name: "expected" },
					{ id: "2", name: "expected" },
				],
				"expected",
			),
		).toThrow("Duplicate bootstrap ownership");
	});

	it.each([
		[{ token: undefined, accessKeyId: undefined, secretAccessKey: undefined, probeSucceeded: false }, "create"],
		[
			{ token: { id: "id", status: "active" }, accessKeyId: "id", secretAccessKey: "secret", probeSucceeded: true },
			"reuse",
		],
		[
			{ token: { id: "id", status: "active" }, accessKeyId: "id", secretAccessKey: "secret", probeSucceeded: false },
			"replace",
		],
		[
			{
				token: { id: "id", status: "active" },
				accessKeyId: undefined,
				secretAccessKey: "secret",
				probeSucceeded: false,
			},
			"replace",
		],
		[
			{ token: { id: "other", status: "active" }, accessKeyId: "id", secretAccessKey: "secret", probeSucceeded: true },
			"replace",
		],
		[
			{ token: { id: "id", status: "disabled" }, accessKeyId: "id", secretAccessKey: "secret", probeSucceeded: true },
			"replace",
		],
		[{ token: undefined, accessKeyId: "id", secretAccessKey: "secret", probeSucceeded: true }, "replace"],
	] as const)("chooses the safe R2 credential action", (input, expected) => {
		expect(decideR2Credentials(input)).toBe(expected);
	});

	it("reconciles staging and production Meta app secrets independently", async () => {
		const stagingSecret = randomUUID();
		const productionSecret = randomUUID();
		expect(decideMetaAppSecret({ staging: stagingSecret, production: productionSecret })).toEqual({
			action: "reuse",
			environments: [],
		});
		expect(decideMetaAppSecret({ staging: stagingSecret, production: undefined })).toEqual({
			action: "prompt",
			environments: ["production"],
		});
		const writes: Array<[string, string]> = [];
		await expect(
			reconcileMetaAppSecretState({
				storedByEnvironment: { staging: undefined, production: undefined },
				requestSecret: async (environment) => (environment === "staging" ? stagingSecret : productionSecret),
				writeSecret: async (environment, value) => {
					writes.push([environment, value]);
				},
			}),
		).resolves.toEqual({ action: "prompt", environments: ["staging", "production"] });
		expect(writes).toEqual([
			["staging", stagingSecret],
			["production", productionSecret],
		]);
	});

	it("replaces an accidentally shared Meta app secret with environment-specific values", async () => {
		const sharedSecret = randomUUID();
		const prompts: string[] = [];
		const writes: string[] = [];
		await expect(
			reconcileMetaAppSecretState({
				storedByEnvironment: { staging: sharedSecret, production: sharedSecret },
				requestSecret: async (environment) => {
					prompts.push(environment);
					return randomUUID();
				},
				writeSecret: async (environment) => {
					writes.push(environment);
				},
			}),
		).resolves.toEqual({ action: "replace-shared", environments: ["staging", "production"] });
		expect(prompts).toEqual(["staging", "production"]);
		expect(writes).toEqual(["staging", "production"]);
	});

	it.each([
		[200, "accepted"],
		[204, "accepted"],
		[401, "rejected"],
		[403, "rejected"],
		[408, "indeterminate"],
		[429, "indeterminate"],
		[500, "indeterminate"],
	] as const)("distinguishes expired credentials from interrupted provider checks", (status, expected) => {
		expect(classifyCredentialResponse(status)).toBe(expected);
	});

	it.each([
		[200, "accepted"],
		[204, "accepted"],
		[401, "rejected"],
		[403, "indeterminate"],
		[404, "indeterminate"],
		[408, "indeterminate"],
		[429, "indeterminate"],
		[500, "indeterminate"],
	] as const)("classifies Neon credential verification responses", (status, expected) => {
		expect(classifyNeonCredentialResponse(status)).toBe(expected);
	});

	it("resolves stable Neon account and project key names from the manifest", () => {
		expect(getNeonAccountApiKeyName(manifest)).toBe("cataqui-backend-opentofu-bootstrap");
		expect(getNeonProjectApiKeyName(manifest, "staging")).toBe("cataqui-backend-project-access-staging");
		expect(getNeonProjectApiKeyName(manifest, "production")).toBe("cataqui-backend-project-access-production");
	});

	it("accepts Neon account-key creation metadata without weakening scope validation", () => {
		const name = "cataqui-backend-opentofu-bootstrap";
		const key = randomUUID();
		expect(
			normalizeCreatedNeonAccountApiKey(
				{
					id: 41,
					name,
					key,
					created_at: "2026-01-01T00:00:00Z",
					created_by: { id: randomUUID() },
				},
				name,
			),
		).toEqual({ id: 41, name, key });
		expect(() => normalizeCreatedNeonAccountApiKey({ id: 1, name, key, project_id: "foreign-project" }, name)).toThrow(
			"invalid credentials",
		);
	});

	it("reuses or repairs one healthy shared Neon account key", () => {
		const expectedName = "cataqui-backend-opentofu-bootstrap";
		const key = randomUUID();
		const inventory = [{ id: 41, name: expectedName, project_id: undefined }];
		expect(
			decideNeonAccountCredential({
				expectedName,
				storedByEnvironment: {
					staging: { key, id: "41" },
					production: { key, id: "41" },
				},
				inventory,
				credentialStatus: "accepted",
			}),
		).toEqual({ action: "reuse", keyId: "41", missingEnvironments: [] });
		expect(
			decideNeonAccountCredential({
				expectedName,
				storedByEnvironment: { staging: { key, id: "41" }, production: {} },
				inventory,
				credentialStatus: "accepted",
			}),
		).toEqual({ action: "repair", keyId: "41", missingEnvironments: ["production"] });
	});

	it("creates a missing Neon account key and replaces one invalid owned key", () => {
		const expectedName = "cataqui-backend-opentofu-bootstrap";
		expect(
			decideNeonAccountCredential({
				expectedName,
				storedByEnvironment: { staging: {}, production: {} },
				inventory: [],
				credentialStatus: "missing",
			}),
		).toEqual({ action: "create" });
		expect(
			decideNeonAccountCredential({
				expectedName,
				storedByEnvironment: { staging: {}, production: {} },
				inventory: [{ id: 51, name: expectedName, project_id: undefined }],
				credentialStatus: "missing",
			}),
		).toEqual({ action: "replace", keyId: "51" });
		expect(
			decideNeonAccountCredential({
				expectedName,
				storedByEnvironment: {
					staging: { key: randomUUID(), id: "52" },
					production: { key: undefined, id: undefined },
				},
				inventory: [{ id: 52, name: expectedName, project_id: null }],
				credentialStatus: "rejected",
			}),
		).toEqual({ action: "replace", keyId: "52" });
	});

	it("fails closed on conflicting, duplicate, foreign, or indeterminate Neon account credentials", () => {
		const expectedName = "cataqui-backend-opentofu-bootstrap";
		expect(() =>
			decideNeonAccountCredential({
				expectedName,
				storedByEnvironment: {
					staging: { key: randomUUID(), id: "61" },
					production: { key: randomUUID(), id: "61" },
				},
				inventory: [{ id: 61, name: expectedName }],
				credentialStatus: "accepted",
			}),
		).toThrow("conflicting Neon account API keys");
		const input = {
			expectedName,
			storedByEnvironment: {
				staging: { key: randomUUID(), id: "61" },
				production: {},
			},
			credentialStatus: "accepted",
		};
		expect(() =>
			decideNeonAccountCredential({
				...input,
				inventory: [
					{ id: 61, name: expectedName, project_id: undefined },
					{ id: 62, name: expectedName, project_id: undefined },
				],
			}),
		).toThrow("Duplicate Neon bootstrap ownership");
		expect(() =>
			decideNeonAccountCredential({
				...input,
				inventory: [{ id: 61, name: "foreign-key", project_id: undefined }],
			}),
		).toThrow("Foreign Neon account API key metadata");
		expect(() =>
			decideNeonAccountCredential({
				...input,
				credentialStatus: "indeterminate",
				inventory: [{ id: 61, name: expectedName, project_id: undefined }],
			}),
		).toThrow("Unable to determine");
		expect(() =>
			decideNeonAccountCredential({
				...input,
				credentialStatus: "foreign",
				inventory: [{ id: 61, name: expectedName, project_id: undefined }],
			}),
		).toThrow("wrong account or organization role");
	});

	it("writes a newly issued shared Neon account key before its reconciliation ID", async () => {
		const events: string[] = [];
		const generatedKey = randomUUID();
		await expect(
			reconcileNeonAccountCredential({
				expectedName: "cataqui-backend-opentofu-bootstrap",
				storedByEnvironment: { staging: {}, production: {} },
				inventory: [],
				verifyKey: async () => "missing",
				revokeKey: async () => events.push("revoke"),
				createKey: async () => ({ id: 71, key: generatedKey }),
				writeKey: async (environment, key) => events.push(`${environment}:key:${key === generatedKey}`),
				writeKeyId: async (environment, keyId) => events.push(`${environment}:id:${keyId}`),
			}),
		).resolves.toEqual({ action: "create", keyId: "71" });
		expect(events).toEqual(["staging:key:true", "staging:id:71", "production:key:true", "production:id:71"]);
	});

	it("does not mutate a healthy Neon account key and revokes an invalid key before replacement", async () => {
		const expectedName = "cataqui-backend-opentofu-bootstrap";
		const events: string[] = [];
		const storedKey = randomUUID();
		await expect(
			reconcileNeonAccountCredential({
				expectedName,
				storedByEnvironment: {
					staging: { key: storedKey, id: "81" },
					production: { key: storedKey, id: "81" },
				},
				inventory: [{ id: 81, name: expectedName, project_id: undefined }],
				verifyKey: async () => "accepted",
				revokeKey: async () => events.push("revoke"),
				createKey: async () => ({ id: 82, key: randomUUID() }),
				writeKey: async () => events.push("key"),
				writeKeyId: async () => events.push("id"),
			}),
		).resolves.toEqual({ action: "reuse", keyId: "81", missingEnvironments: [] });
		expect(events).toEqual([]);

		await reconcileNeonAccountCredential({
			expectedName,
			storedByEnvironment: {
				staging: { key: storedKey, id: "81" },
				production: { key: storedKey, id: "81" },
			},
			inventory: [{ id: 81, name: expectedName, project_id: undefined }],
			verifyKey: async () => "rejected",
			revokeKey: async (keyId) => events.push(`revoke:${keyId}`),
			createKey: async () => {
				events.push("create");
				return { id: 82, key: randomUUID() };
			},
			writeKey: async (environment) => events.push(`${environment}:key`),
			writeKeyId: async (environment) => events.push(`${environment}:id`),
		});
		expect(events).toEqual(["revoke:81", "create", "staging:key", "staging:id", "production:key", "production:id"]);
	});

	it.each([
		[[], { kind: "missing" }, "create"],
		[[], { kind: "hidden-or-missing" }, "claim"],
		[[], { kind: "found", project: { parent: "organizations/945579294313" } }, "import"],
		[
			[],
			{
				kind: "found",
				project: { parent: { id: "945579294313", type: "organization" }, lifecycleState: "ACTIVE" },
			},
			"import",
		],
		[["cataqui-staging-mre5wge"], { kind: "found", project: { parent: "organizations/945579294313" } }, "reconcile"],
	] as const)(
		"chooses the Google project create, import, or reconciliation path",
		(remoteStateProjectIds, projectDiscovery, expected) => {
			expect(
				decideGoogleProject({
					expectedProjectId: "cataqui-staging-mre5wge",
					expectedOrganizationId: "945579294313",
					remoteStateProjectIds: [...remoteStateProjectIds],
					projectDiscovery,
				}),
			).toBe(expected);
		},
	);

	it("recovers only a verified expected Google project left tainted by partial creation", () => {
		expect(
			decideGoogleProject({
				expectedProjectId: "cataqui-staging-mre5wge",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: ["cataqui-staging-mre5wge"],
				taintedProjectIds: ["cataqui-staging-mre5wge"],
				projectDiscovery: { kind: "found", project: { parent: "organizations/945579294313" } },
			}),
		).toBe("recover");
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-staging-mre5wge",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: [],
				taintedProjectIds: ["cataqui-staging-mre5wge"],
				projectDiscovery: { kind: "found", project: { parent: "organizations/945579294313" } },
			}),
		).toThrow("invalid tainted project instance");
	});

	it("classifies Google project discovery without treating provider failures as absence", () => {
		expect(
			classifyGoogleProjectDiscovery({
				projectId: "cataqui-staging-mre5wge",
				status: 0,
				stdout: JSON.stringify({ parent: "organizations/945579294313" }),
				stderr: "",
			}),
		).toEqual({ kind: "found", project: { parent: "organizations/945579294313" } });
		expect(
			classifyGoogleProjectDiscovery({
				projectId: "cataqui-staging-mre5wge",
				status: 1,
				stdout: "",
				stderr: "NOT_FOUND: project does not exist",
			}),
		).toEqual({ kind: "missing" });
		expect(
			classifyGoogleProjectDiscovery({
				projectId: "cataqui-staging-mre5wge",
				status: 1,
				stdout: "",
				stderr:
					"ryan@ventairy.com does not have permission to access projects instance [cataqui-staging-mre5wge] (or it may not exist): The caller does not have permission.",
			}),
		).toEqual({ kind: "hidden-or-missing" });
		expect(() =>
			classifyGoogleProjectDiscovery({
				projectId: "cataqui-staging-mre5wge",
				status: 0,
				stdout: "not-json",
				stderr: "",
			}),
		).toThrow("invalid project metadata");
		expect(() =>
			classifyGoogleProjectDiscovery({
				projectId: "cataqui-staging-mre5wge",
				status: 1,
				stdout: "",
				stderr: "UNAUTHENTICATED: login expired",
			}),
		).toThrow("Unable to determine ownership");
	});

	it("rejects foreign projects and protected legacy state", () => {
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-staging-mre5wge",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: [],
				projectDiscovery: { kind: "found", project: { parent: "organizations/111111111111" } },
			}),
		).toThrow("outside the declared organization");
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-production-jd7bfto",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: ["cataqui"],
				projectDiscovery: { kind: "missing" },
			}),
		).toThrow("unexpected protected project");
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-production-jd7bfto",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: ["cataqui-production-jd7bfto"],
				projectDiscovery: { kind: "missing" },
			}),
		).toThrow("no longer exists");
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-production-jd7bfto",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: [],
				projectDiscovery: {
					kind: "found",
					project: { parent: "organizations/945579294313", lifecycleState: "DELETE_REQUESTED" },
				},
			}),
		).toThrow("not active");
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-production-jd7bfto",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: ["cataqui-production-jd7bfto"],
				projectDiscovery: { kind: "hidden-or-missing" },
			}),
		).toThrow("ownership cannot be verified");
	});

	it("redacts every known secret without exposing short identifiers", () => {
		expect(
			redactSecrets("token=very-secret-value password=another-secret", ["very-secret-value", "another-secret"]),
		).toBe("token=[REDACTED] password=[REDACTED]");
		expect(redactSecrets("id=abc", ["abc"])).toBe("id=abc");
		expect(redactSecrets(42, [undefined])).toBe("42");
	});

	it("compares credential values without timing-sensitive string equality", () => {
		expect(constantTimeEqual("same", "same")).toBe(true);
		expect(constantTimeEqual("same", "different")).toBe(false);
		expect(constantTimeEqual(undefined, "same")).toBe(false);
	});

	it("keeps the local command automatic, scoped, and free of a second manifest", () => {
		const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
		const source = readFileSync(resolve(process.cwd(), "infrastructure/bootstrap/bootstrap.mjs"), "utf8");
		const runtimeSource = readFileSync(
			resolve(process.cwd(), "infrastructure/bootstrap/bootstrap-runtime.mjs"),
			"utf8",
		);
		const cloudflareSource = readFileSync(
			resolve(process.cwd(), "infrastructure/bootstrap/cloudflare-bootstrap.mjs"),
			"utf8",
		);
		const googleSource = readFileSync(
			resolve(process.cwd(), "infrastructure/bootstrap/google-cloud-bootstrap.mjs"),
			"utf8",
		);
		const neonSource = readFileSync(resolve(process.cwd(), "infrastructure/bootstrap/neon-bootstrap.mjs"), "utf8");
		const infisicalSource = readFileSync(
			resolve(process.cwd(), "infrastructure/bootstrap/infisical-bootstrap.mjs"),
			"utf8",
		);
		const metaSource = readFileSync(resolve(process.cwd(), "infrastructure/bootstrap/meta-bootstrap.mjs"), "utf8");
		const upstashSource = readFileSync(
			resolve(process.cwd(), "infrastructure/bootstrap/upstash-bootstrap.mjs"),
			"utf8",
		);

		expect(packageJson.scripts["infrastructure:bootstrap"]).toBe("node infrastructure/bootstrap/bootstrap.mjs");
		expect(packageJson.devDependencies["@clack/prompts"]).toBe("1.7.0");
		expect(source).toContain("if (process.argv.length !== 2)");
		expect(source.split("\n").length).toBeLessThan(160);
		expect(source).toContain("startBootstrapUi()");
		expect(source).toContain("finishBootstrapUi()");
		expect(source).toContain("runBootstrapPhase({ pending, complete }, operation)");
		expect(runtimeSource).toContain("password({");
		expect(runtimeSource).toContain("spinner()");
		expect(runtimeSource).toContain("export async function runBootstrapPhase");
		expect(runtimeSource).toContain("export function runAsync");
		expect(runtimeSource).toContain("spawn(command, args");
		expect(runtimeSource).toContain("setImmediate(resolvePromise)");
		expect(cloudflareSource).toContain('await runAsync("wrangler"');
		expect(cloudflareSource).not.toContain('run("wrangler"');
		expect(source).toContain("requireToolAsync(tool)");
		expect(source).toContain("verifyNeonCliAuthenticationAsync()");
		expect(source).toContain('await runAsync("infisical", ["user", "get", "token"');
		expect(source).not.toContain('const token = run("infisical"');
		expect(runtimeSource).toContain('mask: "•"');
		expect(runtimeSource).toContain('"A value is required."');
		expect(runtimeSource).not.toContain('run("stty"');
		expect(source).toContain('from "./cloudflare-bootstrap.mjs"');
		expect(source).toContain('from "./google-cloud-bootstrap.mjs"');
		expect(source).toContain('from "./infisical-bootstrap.mjs"');
		expect(source).toContain('from "./github-bootstrap.mjs"');
		expect(source).toContain('from "./neon-bootstrap.mjs"');
		expect(source).toContain('from "./upstash-bootstrap.mjs"');
		expect(source).toContain('from "./datadog-bootstrap.mjs"');
		expect(source).toContain("applyGeneratedFolders(infisicalProjectId, infisicalToken)");
		expect(infisicalSource).toContain('"infrastructure/opentofu/roots/infisical-generated-folders"');
		expect(infisicalSource).toContain("INFISICAL_TOKEN: infisicalToken");
		expect(metaSource).toContain('"/generated/webhooks/runtime"');
		expect(googleSource).toContain('rootName: "google-cloud-projects"');
		expect(googleSource).toContain('rootName: "google-cloud-github-auth"');
		expect(packageJson.devDependencies.neon).toBe("4.4.0");
		expect(neonSource).toContain("delete environment.NEON_API_KEY");
		expect(neonSource).toContain("delete environment.NEON_PROFILE");
		expect(neonSource).toContain('name: "NEON_ACCOUNT_API_KEY"');
		expect(neonSource).toContain('name: "NEON_ACCOUNT_API_KEY_ID"');
		expect(neonSource).toContain('["profile", "list", "--output", "json", "--no-analytics"]');
		expect(neonSource).toContain('[...args, "--profile", "DEFAULT", "--output", "json", "--no-analytics"]');
		expect(neonSource).not.toContain('"--api-key"');
		expect(upstashSource).not.toMatch(/UPSTASH_API_KEY\s*[:=]\s*["'][^"']+["']/);
		expect(source).not.toMatch(/--check|--yes|--repair|cloudflare-api-tokens/);
		expect(source).not.toContain("reconcileWorkersDeploymentToken");
		expect(
			[source, readFileSync(resolve(process.cwd(), "infrastructure/bootstrap/cloudflare-bootstrap.mjs"), "utf8")].join(
				"\n",
			),
		).not.toMatch(/CLOUDFLARE_WORKERS_API_TOKEN|cataqui-backend-workers-deployment/);
		expect(source).not.toMatch(/manifest\.json/);
	});
});
