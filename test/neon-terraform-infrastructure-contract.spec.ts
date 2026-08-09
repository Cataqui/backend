import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = process.cwd();
const terraformRoot = resolve(repositoryRoot, "infra/neon/database");
const versionsSource = readFileSync(resolve(terraformRoot, "versions.tf"), "utf8");
const localsSource = readFileSync(resolve(terraformRoot, "locals.tf"), "utf8");
const databaseSource = readFileSync(resolve(terraformRoot, "database.tf"), "utf8");
const outputsSource = readFileSync(resolve(terraformRoot, "outputs.tf"), "utf8");
const testsSource = readFileSync(resolve(terraformRoot, "tests/database.tftest.hcl"), "utf8");
const deployActionSource = readFileSync(
	resolve(repositoryRoot, ".github/actions/deploy-neon-terraform/action.yml"),
	"utf8",
);
const syncActionSource = readFileSync(
	resolve(repositoryRoot, ".github/actions/sync-neon-database-to-infisical/action.yml"),
	"utf8",
);
const driftActionSource = readFileSync(
	resolve(repositoryRoot, ".github/actions/detect-neon-terraform-drift/action.yml"),
	"utf8",
);
const validationWorkflowSource = readFileSync(
	resolve(repositoryRoot, ".github/workflows/neon-terraform-validate.yml"),
	"utf8",
);
const stagingWorkflowSource = readFileSync(resolve(repositoryRoot, ".github/workflows/deploy-staging.yml"), "utf8");
const productionWorkflowSource = readFileSync(
	resolve(repositoryRoot, ".github/workflows/deploy-production.yml"),
	"utf8",
);
const driftWorkflowSource = readFileSync(resolve(repositoryRoot, ".github/workflows/terraform-drift.yml"), "utf8");
const appRolePolicyPath = resolve(
	repositoryRoot,
	".github/actions/deploy-neon-terraform/enforce-app-role-privileges.sql",
);
const appRolePolicySource = existsSync(appRolePolicyPath) ? readFileSync(appRolePolicyPath, "utf8") : "";

describe("Neon Terraform infrastructure", () => {
	it("should pin the Neon provider and Terraform to reviewed compatible versions", () => {
		expect({
			provider: versionsSource.includes('source  = "kislerdm/neon"'),
			providerVersion: versionsSource.includes('version = "~> 0.14.0"'),
			randomProvider: versionsSource.includes('source  = "hashicorp/random"'),
			randomProviderVersion: versionsSource.includes('version = "~> 3.7.0"'),
			terraformVersion: versionsSource.includes('required_version = "~> 1.15.0"'),
		}).toEqual({
			provider: true,
			providerVersion: true,
			randomProvider: true,
			randomProviderVersion: true,
			terraformVersion: true,
		});
	});

	it("should define an independent project, branch, database, and owner for each managed environment", () => {
		expect(
			["staging", "production"].every(
				(environment) =>
					new RegExp(`project_name\\s*=\\s*"cataqui-api-${environment}"`).test(localsSource) &&
					new RegExp(`branch_name\\s*=\\s*"${environment}"`).test(localsSource) &&
					new RegExp(`database_name\\s*=\\s*"cataqui-${environment}"`).test(localsSource) &&
					new RegExp(`owner_role_name\\s*=\\s*"cataqui_${environment}_owner"`).test(localsSource) &&
					new RegExp(`app_role_name\\s*=\\s*"cataqui_${environment}_app"`).test(localsSource),
			),
		).toBe(true);
	});

	it("should use supported Neon Free plan settings and defer the paid suspend timeout", () => {
		expect({
			region: /region_id\s*=\s*"aws-sa-east-1"/.test(databaseSource),
			postgres: databaseSource.includes("pg_version = 18"),
			minimumCompute: databaseSource.includes("autoscaling_limit_min_cu = 0.25"),
			maximumCompute: databaseSource.includes("autoscaling_limit_max_cu = 2"),
			paidSuspendTimeoutDeferred:
				databaseSource.includes("# Paid Scale plan: configure the suspend timeout after upgrading.") &&
				databaseSource.includes("# suspend_timeout_seconds = 300"),
			freePlanDoesNotSetSuspendTimeout: !databaseSource
				.split("\n")
				.filter((line) => !line.trimStart().startsWith("#"))
				.join("\n")
				.includes("suspend_timeout_seconds"),
			restoreHistory: /history_retention_seconds\s*=\s*21600/.test(databaseSource),
			logicalReplicationDisabled: databaseSource.includes('enable_logical_replication = "no"'),
		}).toEqual({
			region: true,
			postgres: true,
			minimumCompute: true,
			maximumCompute: true,
			paidSuspendTimeoutDeferred: true,
			freePlanDoesNotSetSuspendTimeout: true,
			restoreHistory: true,
			logicalReplicationDisabled: true,
		});
	});

	it("should protect both managed projects from accidental Terraform destruction", () => {
		expect({
			preventDestroy: databaseSource.includes("prevent_destroy = true"),
			allEnvironmentsTested: ["staging", "production"].every((environment) =>
				testsSource.includes(`${environment}_uses_the_recommended_free_plan_configuration`),
			),
		}).toEqual({ preventDestroy: true, allEnvironmentsTested: true });
	});

	it("should expose the project identity and only the sensitive credentials required by deployment", () => {
		expect({
			projectId: outputsSource.includes("project_id"),
			ownerDirectUrl: outputsSource.includes('output "database_owner_direct_url"'),
			appPoolerUrl: outputsSource.includes('output "database_app_pooler_url"'),
			directSensitive: /output\s+"database_owner_direct_url"\s*\{[\s\S]*?sensitive\s*=\s*true/.test(outputsSource),
			pooledSensitive: /output\s+"database_app_pooler_url"\s*\{[\s\S]*?sensitive\s*=\s*true/.test(outputsSource),
			appPassword: /output\s+"database_app_password"\s*\{[\s\S]*?sensitive\s*=\s*true/.test(outputsSource),
		}).toEqual({
			projectId: true,
			ownerDirectUrl: true,
			appPoolerUrl: true,
			directSensitive: true,
			pooledSensitive: true,
			appPassword: true,
		});
	});

	it("should provision a dedicated application login separately from the database owner", () => {
		expect({
			noApiCreatedAppRole: !databaseSource.includes('resource "neon_role" "app"'),
			appPassword: databaseSource.includes('resource "random_password" "app"'),
			appPoolerHost: outputsSource.includes("neon_project.database.database_host_pooler"),
			appPoolerPassword: outputsSource.includes("random_password.app.result"),
			appPoolerUser: outputsSource.includes("local.database_configuration.app_role_name"),
			ownerDirectUrl: outputsSource.includes("neon_project.database.connection_uri"),
		}).toEqual({
			noApiCreatedAppRole: true,
			appPassword: true,
			appPoolerHost: true,
			appPoolerPassword: true,
			appPoolerUser: true,
			ownerDirectUrl: true,
		});
	});

	it("should enforce least privilege before exporting application credentials", () => {
		const privilegeEnforcementPosition = deployActionSource.indexOf("Enforce least-privilege application access");
		const credentialExportPosition = deployActionSource.indexOf(
			"Prepare generated database configuration for secure synchronization",
		);

		expect({
			beforeExport:
				privilegeEnforcementPosition >= 0 &&
				credentialExportPosition >= 0 &&
				privilegeEnforcementPosition < credentialExportPosition,
			executesPolicy: deployActionSource.includes("enforce-app-role-privileges.sql"),
			passesTerraformRole: deployActionSource.includes('--set=app_role_name="$app_role_name"'),
			readsTerraformRole:
				deployActionSource.includes("terraform output -json project") && deployActionSource.includes(".app_role"),
			passesTerraformPassword: deployActionSource.includes('--set=app_role_password="$app_role_password"'),
			policyUsesRoleParameter: appRolePolicySource.includes(":'app_role_name'"),
			policyUsesPasswordParameter: appRolePolicySource.includes(":'app_role_password'"),
			policyIsTransactional:
				appRolePolicySource.startsWith("BEGIN;") && appRolePolicySource.trimEnd().endsWith("COMMIT;"),
			grantsExistingTypesIndividually:
				appRolePolicySource.includes("GRANT USAGE ON TYPE %I.%I TO %I") && appRolePolicySource.includes("FROM pg_type"),
			doesNotUseUnsupportedAllTypesGrant: !appRolePolicySource.includes("GRANT USAGE ON ALL TYPES"),
			createsSqlManagedRole: appRolePolicySource.includes("CREATE ROLE %I WITH LOGIN PASSWORD %L"),
			rejectsResidualApiCreatedAdminRole: appRolePolicySource.includes(
				"must be removed by Terraform before SQL creates the least-privilege role",
			),
			doesNotAttemptUnauthorizedRevoke: !appRolePolicySource.includes("REVOKE neon_superuser"),
			doesNotAttemptUnauthorizedDrop: !appRolePolicySource.includes("DROP ROLE"),
			policyHasNoSharedRoleLiteral: !appRolePolicySource.includes("cataqui_app"),
		}).toEqual({
			beforeExport: true,
			executesPolicy: true,
			passesTerraformRole: true,
			readsTerraformRole: true,
			passesTerraformPassword: true,
			policyUsesRoleParameter: true,
			policyUsesPasswordParameter: true,
			policyIsTransactional: true,
			grantsExistingTypesIndividually: true,
			doesNotUseUnsupportedAllTypesGrant: true,
			createsSqlManagedRole: true,
			rejectsResidualApiCreatedAdminRole: true,
			doesNotAttemptUnauthorizedRevoke: true,
			doesNotAttemptUnauthorizedDrop: true,
			policyHasNoSharedRoleLiteral: true,
		});
	});

	it("should synchronize generated database configuration before migrations can start", () => {
		expect(
			[stagingWorkflowSource, productionWorkflowSource].every(
				(source) =>
					source.includes("id: neon-terraform") &&
					source.includes("uses: ./.github/actions/sync-neon-database-to-infisical") &&
					source.includes("project-id: $" + "{{ steps.neon-terraform.outputs.project-id }}") &&
					source.includes(
						"database-owner-direct-url: $" + "{{ steps.neon-terraform.outputs.database-owner-direct-url }}",
					) &&
					source.includes("database-app-pooler-url: $" + "{{ steps.neon-terraform.outputs.database-app-pooler-url }}"),
			),
		).toBe(true);
	});

	it("should create migration test branches with each environment's managed owner role", () => {
		expect(
			[
				{ environment: "staging", source: stagingWorkflowSource },
				{ environment: "production", source: productionWorkflowSource },
			].every(({ environment, source }) => source.includes(`role: cataqui_${environment}_owner`)),
		).toBe(true);
	});

	it("should synchronize runtime and migration values only to their isolated Infisical folders", () => {
		expect({
			runtimeFolder: syncActionSource.includes('--path="/runtime"'),
			databaseFolder: syncActionSource.includes('--path="/database"'),
			projectId: syncActionSource.includes('"NEON_PROJECT_ID=$NEON_PROJECT_ID"'),
			ownerDirectUrl: syncActionSource.includes('"DATABASE_OWNER_DIRECT_URL=$DATABASE_OWNER_DIRECT_URL"'),
			appPoolerUrl: syncActionSource.includes('"DATABASE_APP_POOLER_URL=$DATABASE_APP_POOLER_URL"'),
			migrationApiKey: syncActionSource.includes('"NEON_API_KEY=$NEON_API_KEY"'),
		}).toEqual({
			runtimeFolder: true,
			databaseFolder: true,
			projectId: true,
			ownerDirectUrl: true,
			appPoolerUrl: true,
			migrationApiKey: true,
		});
	});

	it("should validate formatting, configuration, lint rules, and behavior before applying", () => {
		expect(
			[
				"terraform fmt -check",
				"terraform validate",
				"tflint",
				"terraform test",
				"terraform plan",
				"terraform apply",
			].every((command) => deployActionSource.includes(command)),
		).toBe(true);
	});

	it("should pass the Neon API key only through the provider environment variable", () => {
		expect({
			deployUsesProviderEnvironment: deployActionSource.includes("NEON_API_KEY: $" + "{{ inputs.neon-api-key }}"),
			driftUsesProviderEnvironment: driftActionSource.includes("NEON_API_KEY: $" + "{{ inputs.neon-api-key }}"),
			usesTerraformSecretVariable: /TF_VAR_neon_api_key/.test(`${deployActionSource}\n${driftActionSource}`),
		}).toEqual({
			deployUsesProviderEnvironment: true,
			driftUsesProviderEnvironment: true,
			usesTerraformSecretVariable: false,
		});
	});

	it("should authenticate the pinned official Infisical CLI and avoid custom REST requests", () => {
		expect({
			pinsGitHubScript: syncActionSource.includes("actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd"),
			requestsCataquiAudience: syncActionSource.includes('core.getIDToken("https://github.com/Cataqui")'),
			usesInfisicalCli: syncActionSource.includes("infisical login") && syncActionSource.includes("--method=oidc-auth"),
			usesRawInfisicalApi: /curl|\/api\/v[0-9]+\/|--request (?:PATCH|POST)/.test(syncActionSource),
		}).toEqual({
			pinsGitHubScript: true,
			requestsCataquiAudience: true,
			usesInfisicalCli: true,
			usesRawInfisicalApi: false,
		});
	});

	it("should validate Neon Terraform on pull requests without credentials", () => {
		const terraformPlanWorkflowSource = readFileSync(
			resolve(repositoryRoot, ".github/workflows/terraform-plan.yml"),
			"utf8",
		);

		expect({
			usesValidationWorkflow: terraformPlanWorkflowSource.includes(
				"uses: ./.github/workflows/neon-terraform-validate.yml",
			),
			runsTests: validationWorkflowSource.includes("run: terraform test"),
			referencesSecrets: /\bsecrets(?:\.|:)/.test(validationWorkflowSource),
		}).toEqual({ usesValidationWorkflow: true, runsTests: true, referencesSecrets: false });
	});

	it("should detect drift in both managed databases without applying changes", () => {
		expect({
			allEnvironments: driftWorkflowSource.includes("environment: [staging, production]"),
			usesDedicatedAction: driftWorkflowSource.includes("uses: ./.github/actions/detect-neon-terraform-drift"),
			detectsDetailedExitCode: driftActionSource.includes("-detailed-exitcode"),
			canApply: driftActionSource.includes("terraform apply"),
		}).toEqual({
			allEnvironments: true,
			usesDedicatedAction: true,
			detectsDetailedExitCode: true,
			canApply: false,
		});
	});

	it("should keep development databases outside managed Terraform automation", () => {
		const ciWorkflowSource = readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
		const terraformPlanWorkflowSource = readFileSync(
			resolve(repositoryRoot, ".github/workflows/terraform-plan.yml"),
			"utf8",
		);

		expect({
			actions: [deployActionSource, syncActionSource, driftActionSource].some((source) =>
				source.includes('!= "development"'),
			),
			ciBranches: ciWorkflowSource.includes("branches: [development, staging, main]"),
			configuration: /\bdevelopment\s*=\s*\{/.test(localsSource),
			drift: driftWorkflowSource.includes("environment: [development, staging, production]"),
			terraformPlanBranches: terraformPlanWorkflowSource.includes("branches: [development, staging, main]"),
			workflowExists: existsSync(resolve(repositoryRoot, ".github/workflows/deploy-development-infrastructure.yml")),
		}).toEqual({
			actions: false,
			ciBranches: false,
			configuration: false,
			drift: false,
			terraformPlanBranches: false,
			workflowExists: false,
		});
	});
});
