import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = process.cwd();
const upstashTerraformRoot = resolve(repositoryRoot, "infrastructure/upstash/redis");
const versionsSource = readFileSync(resolve(upstashTerraformRoot, "versions.tf"), "utf8");
const localsSource = readFileSync(resolve(upstashTerraformRoot, "locals.tf"), "utf8");
const redisSource = readFileSync(resolve(upstashTerraformRoot, "redis.tf"), "utf8");
const outputsSource = readFileSync(resolve(upstashTerraformRoot, "outputs.tf"), "utf8");
const testsSource = readFileSync(resolve(upstashTerraformRoot, "tests/redis.tftest.hcl"), "utf8");
const deployActionSource = readFileSync(
	resolve(repositoryRoot, ".github/actions/deploy-upstash-terraform/action.yml"),
	"utf8",
);
const driftActionSource = readFileSync(
	resolve(repositoryRoot, ".github/actions/detect-upstash-terraform-drift/action.yml"),
	"utf8",
);
const validationWorkflowSource = readFileSync(
	resolve(repositoryRoot, ".github/workflows/upstash-terraform-validate.yml"),
	"utf8",
);
const stagingWorkflowSource = readFileSync(resolve(repositoryRoot, ".github/workflows/deploy-staging.yml"), "utf8");
const productionWorkflowSource = readFileSync(
	resolve(repositoryRoot, ".github/workflows/deploy-production.yml"),
	"utf8",
);
const driftWorkflowSource = readFileSync(resolve(repositoryRoot, ".github/workflows/terraform-drift.yml"), "utf8");

function _workflowJobSource(source: string, jobName: string) {
	const jobStartMarker = `\n  ${jobName}:\n`;
	const jobStart = source.indexOf(jobStartMarker);

	if (jobStart === -1) throw new Error(`missing workflow job: ${jobName}`);

	const remainingSource = source.slice(jobStart + jobStartMarker.length);
	const nextJobOffset = remainingSource.search(/\n {2}[a-z][a-z0-9-]*:\n/u);

	return nextJobOffset === -1 ? remainingSource : remainingSource.slice(0, nextJobOffset);
}

describe("Upstash Redis Terraform infrastructure", () => {
	it("should pin the official Upstash provider to its current compatible minor version", () => {
		expect({
			provider: versionsSource.includes('source  = "upstash/upstash"'),
			providerVersion: versionsSource.includes('version = "~> 2.1.0"'),
			terraformVersion: versionsSource.includes('required_version = "~> 1.15.0"'),
		}).toEqual({
			provider: true,
			providerVersion: true,
			terraformVersion: true,
		});
	});

	it("should require pay as you go for staging and production from one environment source of truth", () => {
		expect({
			stagingDatabase: localsSource.includes('database_name = "cataqui-api-staging"'),
			stagingDatabaseType: /staging\s*=\s*\{[\s\S]*?database_type\s*=\s*"Pay as You Go"/.test(localsSource),
			productionDatabase: localsSource.includes('database_name = "cataqui-api-production"'),
			productionDatabaseType: /production\s*=\s*\{[\s\S]*?database_type\s*=\s*"Pay as You Go"/.test(localsSource),
		}).toEqual({
			stagingDatabase: true,
			stagingDatabaseType: true,
			productionDatabase: true,
			productionDatabaseType: true,
		});
	});

	it("should keep both databases in São Paulo with TLS and destructive deletion protection", () => {
		expect({
			globalDatabase: redisSource.includes('region         = "global"'),
			primaryRegion: redisSource.includes('primary_region = "sa-east-1"'),
			tls: redisSource.includes("tls            = true"),
			preventDestroy: redisSource.includes("prevent_destroy = true"),
		}).toEqual({
			globalDatabase: true,
			primaryRegion: true,
			tls: true,
			preventDestroy: true,
		});
	});

	it("should reject an account whose observed Upstash database type is not pay as you go", () => {
		expect({
			postcondition: redisSource.includes("self.database_type == local.redis_configuration.database_type"),
			stagingMismatchTest: testsSource.includes("a_staging_database_that_is_not_pay_as_you_go_is_rejected"),
			productionMismatchTest: testsSource.includes("a_production_database_that_is_not_pay_as_you_go_is_rejected"),
		}).toEqual({
			postcondition: true,
			stagingMismatchTest: true,
			productionMismatchTest: true,
		});
	});

	it("should expose the REST URL and a sensitive REST token for automatic secret synchronization", () => {
		expect({
			hasRestUrl: outputsSource.includes("rest_url"),
			hasRestToken: outputsSource.includes("rest_token"),
			hasSensitiveRestToken: /output\s+"redis_rest_token"\s*\{[\s\S]*?sensitive\s*=\s*true/.test(outputsSource),
			hasPassword: outputsSource.includes("password"),
		}).toEqual({
			hasRestUrl: true,
			hasRestToken: true,
			hasSensitiveRestToken: true,
			hasPassword: false,
		});
	});

	it("should synchronize generated REST credentials to Infisical before migrations can start", () => {
		expect(
			[stagingWorkflowSource, productionWorkflowSource].every((source) => {
				const upstashJob = _workflowJobSource(source, "infrastructure-upstash");
				const readinessJob = _workflowJobSource(source, "infrastructure-readiness");
				const migrationJob = _workflowJobSource(source, "migrate");

				return (
					upstashJob.includes("id: upstash-terraform") &&
					upstashJob.includes("uses: ./.github/actions/sync-upstash-redis-to-infisical") &&
					upstashJob.includes("project-id: $" + "{{ vars.INFISICAL_PROJECT_ID }}") &&
					upstashJob.includes("redis-rest-url: $" + "{{ steps.upstash-terraform.outputs.redis-rest-url }}") &&
					upstashJob.includes("redis-rest-token: $" + "{{ steps.upstash-terraform.outputs.redis-rest-token }}") &&
					readinessJob.includes("- infrastructure-upstash") &&
					readinessJob.includes("UPSTASH_RESULT: $" + "{{ needs.infrastructure-upstash.result }}") &&
					readinessJob.includes('"$DEPLOY_UPSTASH" == "true" && "$UPSTASH_RESULT" != "success"') &&
					migrationJob.includes("needs: [affected-scope, infrastructure-readiness]") &&
					migrationJob.includes("needs.infrastructure-readiness.result == 'success'")
				);
			}),
		).toBe(true);
	});

	it("should pass provider credentials only through environment variables in authenticated Terraform steps", () => {
		expect({
			usesProviderEmailEnvironmentVariable: deployActionSource.includes(
				"UPSTASH_EMAIL: $" + "{{ inputs.upstash-email }}",
			),
			usesProviderApiKeyEnvironmentVariable: deployActionSource.includes(
				"UPSTASH_API_KEY: $" + "{{ inputs.upstash-api-key }}",
			),
			usesTerraformCredentialVariables: /TF_VAR_upstash_(email|api_key)/.test(deployActionSource),
		}).toEqual({
			usesProviderEmailEnvironmentVariable: true,
			usesProviderApiKeyEnvironmentVariable: true,
			usesTerraformCredentialVariables: false,
		});
	});

	it("should validate formatting, configuration, lint rules, and Terraform behavior before applying", () => {
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

	it("should validate Upstash Terraform on pull requests without environment credentials", () => {
		const terraformPlanWorkflowSource = readFileSync(
			resolve(repositoryRoot, ".github/workflows/terraform-plan.yml"),
			"utf8",
		);

		expect({
			usesValidationWorkflow: terraformPlanWorkflowSource.includes(
				"uses: ./.github/workflows/upstash-terraform-validate.yml",
			),
			runsTests: validationWorkflowSource.includes("run: terraform test"),
			referencesSecrets: /\bsecrets(?:\.|:)/.test(validationWorkflowSource),
		}).toEqual({
			usesValidationWorkflow: true,
			runsTests: true,
			referencesSecrets: false,
		});
	});

	it("should deploy each Upstash database inside its protected GitHub environment before migrations", () => {
		const stagingReadinessJob = _workflowJobSource(stagingWorkflowSource, "infrastructure-readiness");
		const productionReadinessJob = _workflowJobSource(productionWorkflowSource, "infrastructure-readiness");
		const stagingMigrationJob = _workflowJobSource(stagingWorkflowSource, "migrate");
		const productionMigrationJob = _workflowJobSource(productionWorkflowSource, "migrate");

		expect({
			stagingEnvironment: /infrastructure-upstash:[\s\S]*?environment:\n\s+name: staging/.test(stagingWorkflowSource),
			productionEnvironment: /infrastructure-upstash:[\s\S]*?environment:\n\s+name: production/.test(
				productionWorkflowSource,
			),
			stagingBlocksMigrations:
				stagingReadinessJob.includes("- infrastructure-upstash") &&
				stagingMigrationJob.includes("needs: [affected-scope, infrastructure-readiness]"),
			productionBlocksMigrations:
				productionReadinessJob.includes("- infrastructure-upstash") &&
				productionMigrationJob.includes("needs: [affected-scope, infrastructure-readiness]"),
		}).toEqual({
			stagingEnvironment: true,
			productionEnvironment: true,
			stagingBlocksMigrations: true,
			productionBlocksMigrations: true,
		});
	});

	it("should load the Upstash Terraform authentication pair from Infisical", () => {
		expect({
			deploymentsUseApplyProfile: [stagingWorkflowSource, productionWorkflowSource].every((source) =>
				source.includes("profile: upstash-terraform-apply"),
			),
			driftUsesDriftProfile: driftWorkflowSource.includes("profile: upstash-terraform-drift"),
			allUseInfisicalOutputs: [stagingWorkflowSource, productionWorkflowSource, driftWorkflowSource].every(
				(source) =>
					source.includes("steps.infisical.outputs.upstash_terraform_email") &&
					source.includes("steps.infisical.outputs.upstash_terraform_api_key") &&
					!source.includes("vars.UPSTASH_TERRAFORM_EMAIL") &&
					!source.includes("secrets.UPSTASH_TERRAFORM_API_KEY"),
			),
		}).toEqual({
			deploymentsUseApplyProfile: true,
			driftUsesDriftProfile: true,
			allUseInfisicalOutputs: true,
		});
	});

	it("should detect Upstash drift in both persistent environments without applying changes", () => {
		expect({
			stagingAndProduction: driftWorkflowSource.includes("environment: [staging, production]"),
			usesDedicatedAction: driftWorkflowSource.includes("uses: ./.github/actions/detect-upstash-terraform-drift"),
			detectsDetailedExitCode: driftActionSource.includes("-detailed-exitcode"),
			canApply: driftActionSource.includes("terraform apply"),
		}).toEqual({
			stagingAndProduction: true,
			usesDedicatedAction: true,
			detectsDetailedExitCode: true,
			canApply: false,
		});
	});
});
