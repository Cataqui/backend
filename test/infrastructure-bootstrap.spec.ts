import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	classifyCredentialResponse,
	decideR2Credentials,
	getR2TokenName,
} from "../infrastructure/bootstrap/cloudflare-reconciliation.mjs";
import { decideGoogleProject } from "../infrastructure/bootstrap/google-cloud-reconciliation.mjs";
import {
	constantTimeEqual,
	redactSecrets,
	resolveUniqueNamedResource,
	validatePlatforms,
} from "../infrastructure/bootstrap/reconciliation.mjs";

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

		expect(packageJson.scripts["infrastructure:bootstrap"]).toBe("node infrastructure/bootstrap/bootstrap.mjs");
		expect(source).toContain("if (process.argv.length !== 2)");
		expect(source.split("\n").length).toBeLessThan(120);
		expect(source).toContain('from "./cloudflare-bootstrap.mjs"');
		expect(source).toContain('from "./google-cloud-bootstrap.mjs"');
		expect(source).toContain('from "./infisical-bootstrap.mjs"');
		expect(source).toContain('from "./github-bootstrap.mjs"');
		expect(googleSource).toContain('rootName: "google-cloud-projects"');
		expect(googleSource).toContain('rootName: "google-cloud-github-auth"');
		expect(source).not.toMatch(/--check|--yes|--repair|cloudflare-api-tokens|infisical-generated-folders/);
		expect(source).not.toMatch(/manifest\.json/);
	});
});
