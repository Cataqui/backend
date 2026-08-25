import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	classifyCredentialResponse,
	decideR2Credentials,
	getR2TokenName,
} from "../infrastructure/bootstrap/cloudflare-reconciliation.mjs";
import { decideGoogleProject } from "../infrastructure/bootstrap/google-cloud-reconciliation.mjs";
import {
	classifyNeonCredentialResponse,
	decideNeonCredential,
	getNeonApiKeyName,
	reconcileNeonCredential,
} from "../infrastructure/bootstrap/neon-reconciliation.mjs";
import {
	constantTimeEqual,
	redactSecrets,
	resolveUniqueNamedResource,
	validatePlatforms,
} from "../infrastructure/bootstrap/reconciliation.mjs";
import {
	classifyUpstashCredentialResponse,
	decideUpstashCredential,
	reconcileUpstashCredential,
} from "../infrastructure/bootstrap/upstash-reconciliation.mjs";

const platforms = JSON.parse(readFileSync(resolve(process.cwd(), "infrastructure/platforms.json"), "utf8"));

describe("infrastructure bootstrap reconciliation", () => {
	it("accepts the committed stable bootstrap contract", () => {
		expect(validatePlatforms(platforms)).toBe(platforms);
		expect(platforms.cloudflare.r2.buckets).toEqual({ opentofu_state: "cataqui-opentofu-state" });
		expect(getR2TokenName(platforms, "staging")).toBe("cataqui-opentofu-state-staging");
		expect(getR2TokenName(platforms, "production")).toBe("cataqui-opentofu-state-production");
		expect(platforms.google_cloud.projects).toEqual({
			cataqui_staging: "cataqui-staging-mre5wge",
			cataqui_production: "cataqui-production-jd7bfto",
		});
		expect(platforms.google_cloud.github_auth.service_accounts).toEqual({
			cataqui_backend_staging: "cataqui-backend-opentofu-stg",
			cataqui_backend_production: "cataqui-backend-opentofu-prod",
		});
		expect(platforms.infisical.opentofu_identities).toEqual({
			cataqui_backend_staging: "cataqui-backend-opentofu-staging",
			cataqui_backend_production: "cataqui-backend-opentofu-production",
		});
		expect(platforms.github.environments).toEqual({
			staging: { branches: ["staging"] },
			production: { branches: ["main"] },
		});
		expect(platforms.upstash).toEqual({ account_email: "ryan@ventairy.com" });
	});

	it("rejects invalid and unexpected platform values", () => {
		expect(() =>
			validatePlatforms({ ...platforms, cloudflare: { ...platforms.cloudflare, account_id: "secret" } }),
		).toThrow("cloudflare.account_id");
		expect(() =>
			validatePlatforms({
				...platforms,
				infisical: { ...platforms.infisical, api_url: "https://example.com" },
			}),
		).toThrow("Unexpected keys in platform object: infisical");
		expect(() =>
			validatePlatforms({
				...platforms,
				google_cloud: {
					...platforms.google_cloud,
					projects: { ...platforms.google_cloud.projects, legacy_id: "legacy" },
				},
			}),
		).toThrow("Unexpected keys");
		expect(() => validatePlatforms({ ...platforms, github: { ...platforms.github, environments: undefined } })).toThrow(
			"Invalid platform object",
		);
		expect(() =>
			validatePlatforms({
				...platforms,
				github: {
					...platforms.github,
					environments: { ...platforms.github.environments, staging: { branches: [] } },
				},
			}),
		).toThrow("Invalid branch policy");
		expect(() => validatePlatforms({ ...platforms, upstash: { account_email: "not-an-email" } })).toThrow(
			"upstash.account_email",
		);
		expect(() => validatePlatforms({ ...platforms, upstash: { ...platforms.upstash, api_key: "forbidden" } })).toThrow(
			"Unexpected keys in platform object: upstash",
		);
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

	it("derives stable environment-scoped Neon key names", () => {
		expect(getNeonApiKeyName("staging")).toBe("cataqui-backend-opentofu-staging");
		expect(getNeonApiKeyName("production")).toBe("cataqui-backend-opentofu-production");
	});

	it("reuses or adopts one healthy organization-wide Neon key", () => {
		const inventory = [{ id: 41, name: "cataqui-backend-opentofu-staging", project_id: undefined }];
		expect(
			decideNeonCredential({
				expectedName: "cataqui-backend-opentofu-staging",
				storedKey: randomUUID(),
				storedKeyId: "41",
				inventory,
				credentialStatus: "accepted",
			}),
		).toEqual({ action: "reuse", keyId: "41" });
		expect(
			decideNeonCredential({
				expectedName: "cataqui-backend-opentofu-staging",
				storedKey: randomUUID(),
				storedKeyId: undefined,
				inventory,
				credentialStatus: "accepted",
			}),
		).toEqual({ action: "adopt", keyId: "41" });
	});

	it("creates missing Neon keys and replaces one invalid or orphaned key", () => {
		const expectedName = "cataqui-backend-opentofu-production";
		expect(
			decideNeonCredential({
				expectedName,
				storedKey: undefined,
				storedKeyId: undefined,
				inventory: [],
				credentialStatus: "missing",
			}),
		).toEqual({ action: "create" });
		expect(
			decideNeonCredential({
				expectedName,
				storedKey: randomUUID(),
				storedKeyId: "52",
				inventory: [{ id: 52, name: expectedName, project_id: null }],
				credentialStatus: "rejected",
			}),
		).toEqual({ action: "replace", keyId: "52" });
		expect(
			decideNeonCredential({
				expectedName,
				storedKey: undefined,
				storedKeyId: "52",
				inventory: [{ id: 52, name: expectedName, project_id: null }],
				credentialStatus: "missing",
			}),
		).toEqual({ action: "replace", keyId: "52" });
	});

	it("fails closed on ambiguous, scoped, foreign, or indeterminate Neon credentials", () => {
		const expectedName = "cataqui-backend-opentofu-staging";
		const input = {
			expectedName,
			storedKey: randomUUID(),
			storedKeyId: "61",
			credentialStatus: "accepted",
		};
		expect(() =>
			decideNeonCredential({
				...input,
				inventory: [
					{ id: 61, name: expectedName, project_id: undefined },
					{ id: 62, name: expectedName, project_id: undefined },
				],
			}),
		).toThrow("Duplicate Neon bootstrap ownership");
		expect(() =>
			decideNeonCredential({
				...input,
				inventory: [{ id: 61, name: expectedName, project_id: "project-id" }],
			}),
		).toThrow("organization-wide");
		expect(() =>
			decideNeonCredential({
				...input,
				inventory: [{ id: 61, name: "foreign-key", project_id: undefined }],
			}),
		).toThrow("Foreign Neon API key metadata");
		expect(() =>
			decideNeonCredential({
				...input,
				credentialStatus: "indeterminate",
				inventory: [{ id: 61, name: expectedName, project_id: undefined }],
			}),
		).toThrow("Unable to determine");
		expect(() =>
			decideNeonCredential({
				...input,
				credentialStatus: "foreign",
				inventory: [{ id: 61, name: expectedName, project_id: undefined }],
			}),
		).toThrow("foreign organization");
	});

	it("writes a newly issued Neon key before its reconciliation ID", async () => {
		const events: string[] = [];
		const generatedKey = randomUUID();
		await expect(
			reconcileNeonCredential({
				expectedName: "cataqui-backend-opentofu-staging",
				storedKey: undefined,
				storedKeyId: undefined,
				inventory: [],
				verifyKey: async () => "accepted",
				revokeKey: async () => events.push("revoke"),
				createKey: async () => ({ id: 71, key: generatedKey }),
				writeKey: async (key) => events.push(key === generatedKey ? "key" : "unexpected"),
				writeKeyId: async (keyId) => events.push(`id:${keyId}`),
			}),
		).resolves.toEqual({ action: "create", keyId: "71" });
		expect(events).toEqual(["key", "id:71"]);
	});

	it("does not mutate a healthy Neon credential and revokes an orphan before replacement", async () => {
		const expectedName = "cataqui-backend-opentofu-production";
		const events: string[] = [];
		await expect(
			reconcileNeonCredential({
				expectedName,
				storedKey: randomUUID(),
				storedKeyId: "81",
				inventory: [{ id: 81, name: expectedName, project_id: undefined }],
				verifyKey: async () => "accepted",
				revokeKey: async () => events.push("revoke"),
				createKey: async () => ({ id: 82, key: randomUUID() }),
				writeKey: async () => events.push("key"),
				writeKeyId: async () => events.push("id"),
			}),
		).resolves.toEqual({ action: "reuse", keyId: "81" });
		expect(events).toEqual([]);

		await reconcileNeonCredential({
			expectedName,
			storedKey: undefined,
			storedKeyId: "81",
			inventory: [{ id: 81, name: expectedName, project_id: undefined }],
			verifyKey: async () => "missing",
			revokeKey: async (keyId) => events.push(`revoke:${keyId}`),
			createKey: async () => {
				events.push("create");
				return { id: 82, key: randomUUID() };
			},
			writeKey: async () => events.push("key"),
			writeKeyId: async () => events.push("id"),
		});
		expect(events).toEqual(["revoke:81", "create", "key", "id"]);
	});

	it.each([
		[[], undefined, "create"],
		[[], { parent: "organizations/945579294313" }, "import"],
		[[], { parent: { id: "945579294313", type: "organization" }, lifecycleState: "ACTIVE" }, "import"],
		[["cataqui-staging-mre5wge"], { parent: "organizations/945579294313" }, "reconcile"],
	] as const)(
		"chooses the Google project create, import, or reconciliation path",
		(remoteStateProjectIds, discoveredProject, expected) => {
			expect(
				decideGoogleProject({
					expectedProjectId: "cataqui-staging-mre5wge",
					expectedOrganizationId: "945579294313",
					remoteStateProjectIds: [...remoteStateProjectIds],
					discoveredProject,
				}),
			).toBe(expected);
		},
	);

	it("rejects foreign projects and protected legacy state", () => {
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-staging-mre5wge",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: [],
				discoveredProject: { parent: "organizations/111111111111" },
			}),
		).toThrow("outside the declared organization");
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-production-jd7bfto",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: ["cataqui"],
				discoveredProject: undefined,
			}),
		).toThrow("unexpected protected project");
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-production-jd7bfto",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: ["cataqui-production-jd7bfto"],
				discoveredProject: undefined,
			}),
		).toThrow("no longer exists");
		expect(() =>
			decideGoogleProject({
				expectedProjectId: "cataqui-production-jd7bfto",
				expectedOrganizationId: "945579294313",
				remoteStateProjectIds: [],
				discoveredProject: { parent: "organizations/945579294313", lifecycleState: "DELETE_REQUESTED" },
			}),
		).toThrow("not active");
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
		const googleSource = readFileSync(
			resolve(process.cwd(), "infrastructure/bootstrap/google-cloud-bootstrap.mjs"),
			"utf8",
		);
		const neonSource = readFileSync(resolve(process.cwd(), "infrastructure/bootstrap/neon-bootstrap.mjs"), "utf8");
		const upstashSource = readFileSync(
			resolve(process.cwd(), "infrastructure/bootstrap/upstash-bootstrap.mjs"),
			"utf8",
		);

		expect(packageJson.scripts["infrastructure:bootstrap"]).toBe("node infrastructure/bootstrap/bootstrap.mjs");
		expect(source).toContain("if (process.argv.length !== 2)");
		expect(source.split("\n").length).toBeLessThan(120);
		expect(source).toContain('from "./cloudflare-bootstrap.mjs"');
		expect(source).toContain('from "./google-cloud-bootstrap.mjs"');
		expect(source).toContain('from "./infisical-bootstrap.mjs"');
		expect(source).toContain('from "./github-bootstrap.mjs"');
		expect(source).toContain('from "./neon-bootstrap.mjs"');
		expect(source).toContain('from "./upstash-bootstrap.mjs"');
		expect(googleSource).toContain('rootName: "google-cloud-projects"');
		expect(googleSource).toContain('rootName: "google-cloud-github-auth"');
		expect(packageJson.devDependencies.neon).toBe("4.4.0");
		expect(neonSource).toContain("delete environment.NEON_API_KEY");
		expect(neonSource).toContain("delete environment.NEON_PROFILE");
		expect(neonSource).toContain('["profile", "list", "--output", "json", "--no-analytics"]');
		expect(neonSource).toContain('[...args, "--profile", "DEFAULT", "--output", "json", "--no-analytics"]');
		expect(neonSource).not.toContain('"--api-key"');
		expect(upstashSource).not.toMatch(/UPSTASH_API_KEY\s*[:=]\s*["'][^"']+["']/);
		expect(source).not.toMatch(/--check|--yes|--repair|cloudflare-api-tokens|infisical-generated-folders/);
		expect(source).not.toMatch(/manifest\.json/);
	});
});
