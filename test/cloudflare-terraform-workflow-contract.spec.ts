import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const workflowsDirectory = resolve(process.cwd(), ".github/workflows");
const cloudflareInfrastructureDirectory = resolve(process.cwd(), "infra/cloudflare");
const dependabotSource = readFileSync(resolve(process.cwd(), ".github/dependabot.yml"), "utf8");
const workflowSources = Object.fromEntries(
	readdirSync(workflowsDirectory)
		.filter((fileName) => fileName.endsWith(".yml"))
		.map((fileName) => [fileName, readFileSync(resolve(workflowsDirectory, fileName), "utf8")]),
);

function _getWorkflowSource(fileName: string): string {
	const source = workflowSources[fileName];

	if (source === undefined) {
		throw new Error(`Expected ${fileName} to exist in .github/workflows.`);
	}

	return source;
}

describe("Cloudflare Terraform workflow security", () => {
	it("should pin every external GitHub Action to an immutable commit SHA", () => {
		const externalActionReferences = Object.values(workflowSources).flatMap((source) =>
			source
				.split("\n")
				.map((line) => line.match(/uses:\s*([^#\s]+)/)?.[1])
				.filter((reference): reference is string => reference !== undefined && !reference.startsWith("./")),
		);

		expect(externalActionReferences.every((reference) => /@[0-9a-f]{40}$/.test(reference))).toBe(true);
	});

	it("should never pass all repository secrets to a reusable workflow", () => {
		expect(Object.values(workflowSources).some((source) => source.includes("secrets: inherit"))).toBe(false);
	});

	it("should use the descriptive Terraform API token name in every workflow", () => {
		const combinedWorkflowSource = Object.values(workflowSources).join("\n");

		expect({
			usesTerraformApiToken: /\bTERRAFORM_API_TOKEN\b/.test(combinedWorkflowSource),
			usesLegacyTokenName: /\bTF_API_TOKEN\b/.test(combinedWorkflowSource),
		}).toEqual({
			usesTerraformApiToken: true,
			usesLegacyTokenName: false,
		});
	});

	it("should expose only the read-only Cloudflare token to Terraform plan jobs", () => {
		const terraformPlanSource = _getWorkflowSource("cloudflare-terraform-plan.yml");

		expect(terraformPlanSource.includes("CLOUDFLARE_TERRAFORM_WRITE_API_TOKEN")).toBe(false);
	});

	it("should select the Cloudflare read token through the target GitHub environment", () => {
		const combinedWorkflowSource = Object.values(workflowSources).join("\n");
		const terraformPlanSource = _getWorkflowSource("cloudflare-terraform-plan.yml");

		expect({
			usesEnvironmentScopedName: terraformPlanSource.includes("secrets.CLOUDFLARE_TERRAFORM_READ_API_TOKEN"),
			selectsInputEnvironment: terraformPlanSource.includes(`environment:\n      name: \${{ inputs.environment }}`),
			doesNotCreateDeployment: terraformPlanSource.includes("deployment: false"),
			hasEnvironmentSpecificNames: /CLOUDFLARE_TERRAFORM_(STAGING|PRODUCTION)_READ_API_TOKEN/.test(
				combinedWorkflowSource,
			),
		}).toEqual({
			usesEnvironmentScopedName: true,
			selectsInputEnvironment: true,
			doesNotCreateDeployment: true,
			hasEnvironmentSpecificNames: false,
		});
	});

	it("should expose the write-capable Cloudflare token only inside the protected apply workflow", () => {
		const workflowsUsingEditToken = Object.entries(workflowSources)
			.filter(([, source]) => source.includes("secrets.CLOUDFLARE_TERRAFORM_WRITE_API_TOKEN"))
			.map(([fileName]) => fileName);

		expect(workflowsUsingEditToken).toEqual(["cloudflare-terraform-apply.yml"]);
	});

	it("should require the protected environment before Terraform can apply a saved plan", () => {
		const terraformApplySource = _getWorkflowSource("cloudflare-terraform-apply.yml");
		const protectedEnvironmentPosition = terraformApplySource.indexOf(
			`environment:\n      name: \${{ inputs.environment }}`,
		);
		const applyPosition = terraformApplySource.indexOf("terraform apply");

		expect({
			hasProtectedEnvironment: protectedEnvironmentPosition > -1,
			protectsApply: protectedEnvironmentPosition < applyPosition,
		}).toEqual({
			hasProtectedEnvironment: true,
			protectsApply: true,
		});
	});

	it("should retain saved Terraform plans for only one day", () => {
		expect(_getWorkflowSource("cloudflare-terraform-plan.yml")).toContain("retention-days: 1");
	});

	it("should discover every Terraform component from one shared registry", () => {
		const componentWorkflowSources = [
			_getWorkflowSource("cloudflare-terraform-components-plan.yml"),
			_getWorkflowSource("cloudflare-terraform-components-apply.yml"),
		];
		const componentDiscoveryActionSource = readFileSync(
			resolve(process.cwd(), ".github/actions/discover-cloudflare-terraform-components/action.yml"),
			"utf8",
		);

		expect(
			[
				componentWorkflowSources.every(
					(source) =>
						source.includes("./.github/actions/discover-cloudflare-terraform-components") &&
						source.includes("fromJSON(needs.discover.outputs.components)"),
				),
				componentDiscoveryActionSource.includes("infra/cloudflare/components.json"),
			].every(Boolean),
		).toBe(true);
	});

	it("should validate infrastructure changes whenever the shared Terraform action changes", () => {
		const workflowsTriggeredByInfrastructureAutomation = [
			_getWorkflowSource("ci.yml"),
			_getWorkflowSource("terraform-plan.yml"),
			_getWorkflowSource("deploy-staging.yml"),
			_getWorkflowSource("deploy-production.yml"),
		];

		expect(
			workflowsTriggeredByInfrastructureAutomation.every((source) => source.includes("'.github/actions/**'")),
		).toBe(true);
	});

	it("should register every Cloudflare Terraform root for delivery and drift detection", () => {
		const registeredComponents = JSON.parse(
			readFileSync(resolve(cloudflareInfrastructureDirectory, "components.json"), "utf8"),
		) as string[];
		const terraformRoots = readdirSync(cloudflareInfrastructureDirectory)
			.filter((entry) => existsSync(resolve(cloudflareInfrastructureDirectory, entry, "versions.tf")))
			.sort();

		expect(registeredComponents).toEqual(terraformRoots);
	});

	it("should update every Terraform root through one Dependabot configuration", () => {
		const registeredComponents = JSON.parse(
			readFileSync(resolve(cloudflareInfrastructureDirectory, "components.json"), "utf8"),
		) as string[];

		expect({
			terraformUpdateConfigurations: dependabotSource.match(/package-ecosystem: terraform/g)?.length,
			usesMultipleDirectories: dependabotSource.includes("directories:"),
			includesEveryRoot: registeredComponents.every((component) =>
				dependabotSource.includes(`- /infra/cloudflare/${component}`),
			),
		}).toEqual({
			terraformUpdateConfigurations: 1,
			usesMultipleDirectories: true,
			includesEveryRoot: true,
		});
	});

	it("should install the centrally pinned Terraform version in plan and apply workflows", () => {
		const terraformWorkflowSources = [
			_getWorkflowSource("cloudflare-terraform-plan.yml"),
			_getWorkflowSource("cloudflare-terraform-apply.yml"),
		];

		expect(
			terraformWorkflowSources.every(
				(source) =>
					source.includes("infra/cloudflare/.terraform-version") &&
					source.includes("terraform_version: $" + "{{ steps.terraform-version.outputs.version }}"),
			),
		).toBe(true);
	});

	it("should run every Terraform root on stable Terraform 1.15 while reusable modules remain compatible", () => {
		const pinnedTerraformVersion = readFileSync(
			resolve(cloudflareInfrastructureDirectory, ".terraform-version"),
			"utf8",
		).trim();
		const rootVersionConstraints = ["ai-gateway", "queues"].map((component) =>
			readFileSync(resolve(cloudflareInfrastructureDirectory, component, "versions.tf"), "utf8"),
		);
		const reusableModuleVersionConstraints = readdirSync(resolve(cloudflareInfrastructureDirectory, "modules"))
			.map((moduleName) => resolve(cloudflareInfrastructureDirectory, "modules", moduleName, "versions.tf"))
			.filter((versionsFile) => existsSync(versionsFile))
			.map((versionsFile) => readFileSync(versionsFile, "utf8"));

		expect({
			pinnedTerraformVersion: pinnedTerraformVersion,
			rootsRequireStableMinor: rootVersionConstraints.every((source) =>
				source.includes('required_version = "~> 1.15.0"'),
			),
			reusableModulesSupportTerraformOne: reusableModuleVersionConstraints.every((source) =>
				source.includes('required_version = ">= 1.14.0, < 2.0.0"'),
			),
		}).toEqual({
			pinnedTerraformVersion: "1.15.8",
			rootsRequireStableMinor: true,
			reusableModulesSupportTerraformOne: true,
		});
	});

	it("should run every reusable Terraform module test during credential-free validation", () => {
		const terraformComponentsPlanSource = _getWorkflowSource("cloudflare-terraform-components-plan.yml");

		expect({
			runsOnlyDuringValidation: terraformComponentsPlanSource.includes("if: inputs.mode == 'validate'"),
			discoversReusableModules: terraformComponentsPlanSource.includes("infra/cloudflare/modules/*"),
			runsModuleTests: terraformComponentsPlanSource.includes('terraform -chdir="$module_directory" test'),
		}).toEqual({
			runsOnlyDuringValidation: true,
			discoversReusableModules: true,
			runsModuleTests: true,
		});
	});

	it("should lint only the Cloudflare infrastructure directory", () => {
		const terraformPlanSource = _getWorkflowSource("cloudflare-terraform-plan.yml");

		expect({
			cloudflareDirectoryRuns: terraformPlanSource.match(/--chdir=infra\/cloudflare/g)?.length,
			parentDirectoryRuns: terraformPlanSource.includes("--chdir=.."),
		}).toEqual({
			cloudflareDirectoryRuns: 2,
			parentDirectoryRuns: false,
		});
	});

	it("should run read-only drift detection for staging and production", () => {
		const driftSource = _getWorkflowSource("terraform-drift.yml");

		expect([
			driftSource.includes("environment: staging"),
			driftSource.includes("environment: production"),
			driftSource.match(/mode: drift/g)?.length,
		]).toEqual([true, true, 2]);
	});

	it("should automatically deploy production after the saved plans for a main-branch commit succeed", () => {
		const productionDeploymentSource = _getWorkflowSource("deploy-production.yml");

		expect({
			hasPushTrigger: /\n {2}push:/.test(productionDeploymentSource),
			targetsMain: productionDeploymentSource.includes("branches: [main]"),
			savesPlansForCommit: productionDeploymentSource.includes("artifact_suffix: $" + "{{ github.sha }}"),
			appliesAfterPlan: productionDeploymentSource.includes("needs: infrastructure-plan"),
			migratesAfterApply: productionDeploymentSource.includes("needs: infrastructure-apply"),
			deploysAfterMigration: productionDeploymentSource.includes("needs: migrate"),
		}).toEqual({
			hasPushTrigger: true,
			targetsMain: true,
			savesPlansForCommit: true,
			appliesAfterPlan: true,
			migratesAfterApply: true,
			deploysAfterMigration: true,
		});
	});

	it("should apply only plans produced earlier in the same serialized deployment run", () => {
		const terraformApplySource = _getWorkflowSource("cloudflare-terraform-apply.yml");

		expect({
			downloadsCurrentRunArtifact: terraformApplySource.includes("name: $" + "{{ inputs.plan_artifact_name }}"),
			hasCrossRunInputs: /plan_run_id|reviewed_commit_sha|source_workflow_path/.test(terraformApplySource),
		}).toEqual({
			downloadsCurrentRunArtifact: true,
			hasCrossRunInputs: false,
		});
	});
});
