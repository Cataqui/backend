import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = process.cwd();
const loadInfisicalSecretsActionSource = readFileSync(
	resolve(repositoryRoot, ".github/actions/load-infisical-secrets/action.yml"),
	"utf8",
);
const prepareInfisicalCredentialsSource = readFileSync(
	resolve(repositoryRoot, ".github/actions/load-infisical-secrets/prepare-credentials.mjs"),
	"utf8",
);
const gitignoreSource = readFileSync(resolve(repositoryRoot, ".gitignore"), "utf8");
const dockerignoreSource = readFileSync(resolve(repositoryRoot, ".dockerignore"), "utf8");
const githubAutomationGuidanceSource = readFileSync(resolve(repositoryRoot, ".github/AGENTS.md"), "utf8");
const infisicalProfiles = JSON.parse(
	readFileSync(resolve(repositoryRoot, ".github/actions/load-infisical-secrets/profiles.json"), "utf8"),
) as Record<string, { credentials: string[]; secretPath: string }>;
const authenticatedWorkflowSources = ["deploy-staging.yml", "deploy-production.yml", "terraform-drift.yml"].map(
	(fileName) => readFileSync(resolve(repositoryRoot, ".github/workflows", fileName), "utf8"),
);

describe("Infisical GitHub Actions integration", () => {
	it("should prefer reviewed official automation over custom provider API shell code", () => {
		expect({
			prefersProviderTools: githubAutomationGuidanceSource.includes(
				"Prefer official, provider-maintained CLIs or GitHub Actions",
			),
			requiresImmutableActions: githubAutomationGuidanceSource.includes("full commit SHA"),
			requiresLockedClis: githubAutomationGuidanceSource.includes(
				"exact version and verify its published checksum or lockfile integrity",
			),
			rejectsBlindMarketplaceTrust: githubAutomationGuidanceSource.includes(
				"Marketplace availability alone is not evidence that an action is safe",
			),
		}).toEqual({
			prefersProviderTools: true,
			requiresImmutableActions: true,
			requiresLockedClis: true,
			rejectsBlindMarketplaceTrust: true,
		});
	});

	it("should authenticate to Infisical through GitHub OIDC with an immutable action revision", () => {
		expect({
			usesOidc: loadInfisicalSecretsActionSource.includes('method: "oidc"'),
			usesCataquiAudience: loadInfisicalSecretsActionSource.includes("oidc-audience: https://github.com/Cataqui"),
			pinsAction: loadInfisicalSecretsActionSource.includes(
				"Infisical/secrets-action@77ab1f4ccd183a543cb5b42435fbd181189f4995",
			),
		}).toEqual({
			usesOidc: true,
			usesCataquiAudience: true,
			pinsAction: true,
		});
	});

	it("should define the exact Infisical credentials required by every deployment responsibility", () => {
		expect(infisicalProfiles).toEqual({
			"application-deploy": {
				credentials: [
					"AI_GATEWAY_API_TOKEN",
					"CLOUDFLARE_ACCOUNT_ID",
					"CLOUDFLARE_DEPLOYMENT_API_TOKEN",
					"DATABASE_APP_POOLER_URL",
					"UPSTASH_REDIS_REST_TOKEN",
					"UPSTASH_REDIS_REST_URL",
				],
				secretPath: "/application/deploy",
			},
			"cloudflare-terraform-apply": {
				credentials: [
					"CLOUDFLARE_ACCOUNT_ID",
					"CLOUDFLARE_TERRAFORM_READ_API_TOKEN",
					"CLOUDFLARE_TERRAFORM_WRITE_API_TOKEN",
					"HCP_TERRAFORM_ORGANIZATION",
					"TERRAFORM_API_TOKEN",
				],
				secretPath: "/terraform/cloudflare/apply",
			},
			"cloudflare-terraform-drift": {
				credentials: [
					"CLOUDFLARE_ACCOUNT_ID",
					"CLOUDFLARE_TERRAFORM_READ_API_TOKEN",
					"HCP_TERRAFORM_ORGANIZATION",
					"TERRAFORM_API_TOKEN",
				],
				secretPath: "/terraform/cloudflare/drift",
			},
			"database-migration": {
				credentials: ["DATABASE_OWNER_DIRECT_URL", "NEON_API_KEY", "NEON_PROJECT_ID"],
				secretPath: "/database/migration",
			},
			"neon-terraform-apply": {
				credentials: ["HCP_TERRAFORM_ORGANIZATION", "NEON_API_KEY", "NEON_ORGANIZATION_ID", "TERRAFORM_API_TOKEN"],
				secretPath: "/terraform/neon/apply",
			},
			"neon-terraform-drift": {
				credentials: ["HCP_TERRAFORM_ORGANIZATION", "NEON_API_KEY", "NEON_ORGANIZATION_ID", "TERRAFORM_API_TOKEN"],
				secretPath: "/terraform/neon/drift",
			},
			"upstash-terraform-apply": {
				credentials: [
					"HCP_TERRAFORM_ORGANIZATION",
					"TERRAFORM_API_TOKEN",
					"UPSTASH_TERRAFORM_API_KEY",
					"UPSTASH_TERRAFORM_EMAIL",
				],
				secretPath: "/terraform/upstash/apply",
			},
			"upstash-terraform-drift": {
				credentials: [
					"HCP_TERRAFORM_ORGANIZATION",
					"TERRAFORM_API_TOKEN",
					"UPSTASH_TERRAFORM_API_KEY",
					"UPSTASH_TERRAFORM_EMAIL",
				],
				secretPath: "/terraform/upstash/drift",
			},
		});
	});

	it("should fetch only one profile folder without imports or recursive traversal", () => {
		expect({
			usesProfilePath: loadInfisicalSecretsActionSource.includes(
				"secret-path: $" + "{{ steps.profile.outputs.secret_path }}",
			),
			disablesImports: loadInfisicalSecretsActionSource.includes("include-imports: false"),
			disablesRecursion: loadInfisicalSecretsActionSource.includes("recursive: false"),
			fetchesRoot: /^\s*secret-path:\s*\/$/m.test(loadInfisicalSecretsActionSource),
		}).toEqual({
			usesProfilePath: true,
			disablesImports: true,
			disablesRecursion: true,
			fetchesRoot: false,
		});
	});

	it("should keep fetched secrets out of the job-wide environment", () => {
		expect({
			usesFileExport: loadInfisicalSecretsActionSource.includes("export-type: file"),
			usesEnvironmentExport: loadInfisicalSecretsActionSource.includes("export-type: env"),
			usesDedicatedTemporaryFile: loadInfisicalSecretsActionSource.includes("file-output-path: /.infisical-secrets"),
		}).toEqual({
			usesFileExport: true,
			usesEnvironmentExport: false,
			usesDedicatedTemporaryFile: true,
		});
	});

	it("should reject missing, empty, duplicate, malformed, and unexpected profile credentials", () => {
		expect(
			["missing", "empty", "duplicate", "malformed", "unexpected"].every((failure) =>
				prepareInfisicalCredentialsSource.includes(`${failure} Infisical`),
			),
		).toBe(true);
	});

	it("should mask selected credentials and always remove the plaintext handoff file", () => {
		expect({
			masksValues: prepareInfisicalCredentialsSource.includes("::add-mask::"),
			iteratesSelectedProfile: prepareInfisicalCredentialsSource.includes("profile.credentials"),
			alwaysCleansUp:
				loadInfisicalSecretsActionSource.includes("if: always()") &&
				loadInfisicalSecretsActionSource.includes('rm -f -- "$GITHUB_WORKSPACE/.infisical-secrets"'),
		}).toEqual({
			masksValues: true,
			iteratesSelectedProfile: true,
			alwaysCleansUp: true,
		});
	});

	it("should exclude the plaintext Infisical handoff file from Git and Docker build contexts", () => {
		expect({
			docker: dockerignoreSource.split("\n").includes(".infisical-secrets"),
			git: gitignoreSource.split("\n").includes(".infisical-secrets"),
		}).toEqual({ docker: true, git: true });
	});

	it("should load Infisical only after each job selects its protected environment", () => {
		expect(
			authenticatedWorkflowSources.every(
				(source) =>
					/environment:\n {6}name: (staging|production|\$\{\{ matrix\.environment \}\})/.test(source) &&
					source.includes("uses: ./.github/actions/load-infisical-secrets") &&
					source.includes("id-token: write"),
			),
		).toBe(true);
	});

	it("should grant authenticated workflows only repository read and OIDC token permissions", () => {
		expect(
			authenticatedWorkflowSources.every(
				(source) =>
					source.includes("contents: read") && source.includes("id-token: write") && !source.includes("actions: read"),
			),
		).toBe(true);
	});

	it("should keep only Infisical bootstrap identifiers in GitHub configuration variables", () => {
		const configurationVariableNames = authenticatedWorkflowSources.flatMap((source) =>
			[...source.matchAll(/vars\.([A-Z0-9_]+)/g)].map((match) => match[1]),
		);

		expect([...new Set(configurationVariableNames)].sort()).toEqual([
			"INFISICAL_IDENTITY_ID",
			"INFISICAL_PROJECT_ID",
			"INFISICAL_PROJECT_SLUG",
		]);
	});

	it("should use one Infisical machine identity for every deployment responsibility", () => {
		expect(
			authenticatedWorkflowSources.every(
				(source) =>
					source.includes("vars.INFISICAL_IDENTITY_ID") &&
					!/_APPLICATION_|_DATABASE_|_TERRAFORM_(?:APPLY|DRIFT)_IDENTITY_ID/.test(source),
			),
		).toBe(true);
	});

	it("should install application dependencies and deployment tooling before fetching application credentials", () => {
		expect(
			authenticatedWorkflowSources.slice(0, 2).every((source) => {
				const installIndex = source.lastIndexOf("pnpm install --frozen-lockfile");
				const buildxIndex = source.lastIndexOf("docker/setup-buildx-action@");
				const applicationCredentialsIndex = source.indexOf("profile: application-deploy");

				return installIndex < applicationCredentialsIndex && buildxIndex < applicationCredentialsIndex;
			}),
		).toBe(true);
	});

	it("should install application dependencies before fetching database migration credentials", () => {
		expect(
			authenticatedWorkflowSources.slice(0, 2).every((source) => {
				const installIndex = source.indexOf("pnpm install --frozen-lockfile");
				const migrationCredentialsIndex = source.indexOf("profile: database-migration");

				return installIndex < migrationCredentialsIndex;
			}),
		).toBe(true);
	});

	it("should prevent non-deployment branches from entering authenticated jobs", () => {
		expect({
			staging: (authenticatedWorkflowSources.at(0) ?? "").includes("if: github.ref == 'refs/heads/staging'"),
			production: (authenticatedWorkflowSources.at(1) ?? "").includes("if: github.ref == 'refs/heads/main'"),
			drift: (authenticatedWorkflowSources.at(2) ?? "").includes("if: github.ref == 'refs/heads/main'"),
		}).toEqual({
			staging: true,
			production: true,
			drift: true,
		});
	});

	it("should pin the runner image, bound job duration, and avoid persisting checkout credentials", () => {
		expect(
			authenticatedWorkflowSources.every(
				(source) =>
					!source.includes("ubuntu-latest") &&
					source.includes("timeout-minutes:") &&
					[...source.matchAll(/uses: actions\/checkout@[0-9a-f]{40}/g)].length ===
						[...source.matchAll(/persist-credentials: false/g)].length,
			),
		).toBe(true);
	});

	it("should pass each application credential only to the final Cloudflare deployment step", () => {
		expect(
			authenticatedWorkflowSources
				.slice(0, 2)
				.every((source) =>
					[
						"AI_GATEWAY_API_TOKEN: $" + "{{ steps.infisical.outputs.ai_gateway_api_token }}",
						"DATABASE_APP_POOLER_URL: $" + "{{ steps.infisical.outputs.database_app_pooler_url }}",
						"apiToken: $" + "{{ steps.infisical.outputs.cloudflare_deployment_api_token }}",
						"UPSTASH_REDIS_REST_TOKEN: $" + "{{ steps.infisical.outputs.upstash_redis_rest_token }}",
						"UPSTASH_REDIS_REST_URL: $" + "{{ steps.infisical.outputs.upstash_redis_rest_url }}",
					].every((mapping) => source.includes(mapping)),
				),
		).toBe(true);
	});

	it("should never expose the database owner credential to application deployment jobs", () => {
		expect(
			authenticatedWorkflowSources.slice(0, 2).every((source) => {
				const cloudflareDeploymentPosition = source.indexOf("- name: Deploy to Cloudflare");

				return !source.slice(cloudflareDeploymentPosition).includes("DATABASE_OWNER_DIRECT_URL");
			}),
		).toBe(true);
	});

	it("should not load or deploy Protomap credentials", () => {
		expect(
			[loadInfisicalSecretsActionSource, JSON.stringify(infisicalProfiles), ...authenticatedWorkflowSources].some(
				(source) => /protomap/i.test(source),
			),
		).toBe(false);
	});

	it("should not read deployment credentials from GitHub Actions secrets", () => {
		expect(authenticatedWorkflowSources.some((source) => /secrets\.[A-Z0-9_]+/.test(source))).toBe(false);
	});
});
