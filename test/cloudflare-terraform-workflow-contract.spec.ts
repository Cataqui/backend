import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const workflowsDirectory = resolve(process.cwd(), ".github/workflows");
const actionsDirectory = resolve(process.cwd(), ".github/actions");
const cloudflareInfrastructureDirectory = resolve(process.cwd(), "infra/cloudflare");
const dependabotSource = readFileSync(resolve(process.cwd(), ".github/dependabot.yml"), "utf8");
const workflowSources = Object.fromEntries(
	readdirSync(workflowsDirectory)
		.filter((fileName) => fileName.endsWith(".yml"))
		.map((fileName) => [fileName, readFileSync(resolve(workflowsDirectory, fileName), "utf8")]),
);
const actionSources = Object.fromEntries(
	readdirSync(actionsDirectory)
		.filter((actionName) => existsSync(resolve(actionsDirectory, actionName, "action.yml")))
		.map((actionName) => [actionName, readFileSync(resolve(actionsDirectory, actionName, "action.yml"), "utf8")]),
);

function _getWorkflowSource(fileName: string): string {
	const source = workflowSources[fileName];

	if (source === undefined) {
		throw new Error(`Expected ${fileName} to exist in .github/workflows.`);
	}

	return source;
}

function _getActionSource(actionName: string): string {
	const source = actionSources[actionName];

	if (source === undefined) {
		throw new Error(`Expected ${actionName} to exist in .github/actions.`);
	}

	return source;
}

describe("Cloudflare Terraform workflow security", () => {
	it("should pin every external GitHub Action to an immutable commit SHA", () => {
		const externalActionReferences = [...Object.values(workflowSources), ...Object.values(actionSources)].flatMap(
			(source) =>
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

	it("should read the Terraform API token only inside environment-bound infrastructure jobs", () => {
		const workflowsUsingTerraformApiToken = Object.entries(workflowSources)
			.filter(([, source]) => source.includes("TERRAFORM_API_TOKEN"))
			.map(([fileName, source]) => ({
				fileName: fileName,
				hasEnvironmentBoundary: /environment:\n {6}name: (staging|production|\$\{\{ matrix\.environment \}\})/.test(
					source,
				),
				forwardsToken: source.includes("TERRAFORM_API_TOKEN: $" + "{{ secrets.TERRAFORM_API_TOKEN }}"),
			}))
			.sort(({ fileName: firstFileName }, { fileName: secondFileName }) => firstFileName.localeCompare(secondFileName));

		expect(workflowsUsingTerraformApiToken).toEqual([
			{
				fileName: "deploy-production.yml",
				forwardsToken: false,
				hasEnvironmentBoundary: true,
			},
			{
				fileName: "deploy-staging.yml",
				forwardsToken: false,
				hasEnvironmentBoundary: true,
			},
			{
				fileName: "terraform-drift.yml",
				forwardsToken: false,
				hasEnvironmentBoundary: true,
			},
		]);
	});

	it("should expose only the read-only Cloudflare token to Terraform drift jobs", () => {
		const terraformDriftSource = [
			_getWorkflowSource("terraform-drift.yml"),
			_getActionSource("detect-cloudflare-terraform-drift"),
		].join("\n");

		expect(terraformDriftSource.includes("CLOUDFLARE_TERRAFORM_WRITE_API_TOKEN")).toBe(false);
	});

	it("should select the Cloudflare read token through the target GitHub environment", () => {
		const combinedWorkflowSource = Object.values(workflowSources).join("\n");
		const terraformDriftSource = _getWorkflowSource("terraform-drift.yml");

		expect({
			usesEnvironmentScopedName: terraformDriftSource.includes("secrets.CLOUDFLARE_TERRAFORM_READ_API_TOKEN"),
			selectsInputEnvironment: terraformDriftSource.includes(`environment:\n      name: \${{ matrix.environment }}`),
			doesNotCreateDeployment: terraformDriftSource.includes("deployment: false"),
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

	it("should expose the write-capable Cloudflare token only inside the protected deployment workflow", () => {
		const workflowsUsingEditToken = Object.entries(workflowSources)
			.filter(([, source]) => source.includes("secrets.CLOUDFLARE_TERRAFORM_WRITE_API_TOKEN"))
			.map(([fileName]) => fileName);

		expect(workflowsUsingEditToken).toEqual(["deploy-production.yml", "deploy-staging.yml"]);
	});

	it("should require the protected environment before Terraform can plan or apply infrastructure changes", () => {
		const deploymentWorkflowSources = [
			_getWorkflowSource("deploy-staging.yml"),
			_getWorkflowSource("deploy-production.yml"),
		];
		const terraformDeployActionSource = _getActionSource("deploy-cloudflare-terraform-component");

		expect({
			hasProtectedEnvironment: deploymentWorkflowSources.every((source) =>
				/environment:\n {6}name: (staging|production)/.test(source),
			),
			protectsPlan:
				deploymentWorkflowSources.every((source) =>
					source.includes("./.github/actions/deploy-cloudflare-terraform-component"),
				) && terraformDeployActionSource.includes("terraform plan"),
			protectsApply:
				deploymentWorkflowSources.every((source) =>
					source.includes("./.github/actions/deploy-cloudflare-terraform-component"),
				) && terraformDeployActionSource.includes("terraform apply"),
		}).toEqual({
			hasProtectedEnvironment: true,
			protectsPlan: true,
			protectsApply: true,
		});
	});

	it("should keep the exact Terraform plan only on the ephemeral runner that applies it", () => {
		const terraformDeploySource = _getActionSource("deploy-cloudflare-terraform-component");
		const combinedAutomationSource = [...Object.values(workflowSources), ...Object.values(actionSources)].join("\n");

		expect({
			createsExactPlan: terraformDeploySource.includes("terraform plan -input=false -lock-timeout=5m -out=tfplan"),
			appliesExactPlan: terraformDeploySource.includes("terraform apply -input=false -lock-timeout=5m tfplan"),
			uploadsPlanArtifact: /upload-artifact[\s\S]*tfplan/.test(combinedAutomationSource),
			downloadsPlanArtifact: /download-artifact[\s\S]*tfplan/.test(combinedAutomationSource),
		}).toEqual({
			createsExactPlan: true,
			appliesExactPlan: true,
			uploadsPlanArtifact: false,
			downloadsPlanArtifact: false,
		});
	});

	it("should discover every Terraform component from one shared registry", () => {
		const componentWorkflowSources = [
			_getWorkflowSource("deploy-staging.yml"),
			_getWorkflowSource("deploy-production.yml"),
			_getWorkflowSource("terraform-drift.yml"),
			_getWorkflowSource("cloudflare-terraform-components-validate.yml"),
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
						source.includes("fromJSON(needs.") &&
						source.includes(".outputs.components)"),
				),
				componentDiscoveryActionSource.includes("infra/cloudflare/components.json"),
			].every(Boolean),
		).toBe(true);
	});

	it("should consume environment secrets in the same matrix jobs that run Terraform", () => {
		const environmentBoundTerraformSources = [
			_getWorkflowSource("deploy-staging.yml"),
			_getWorkflowSource("deploy-production.yml"),
			_getWorkflowSource("terraform-drift.yml"),
		];

		expect(
			environmentBoundTerraformSources.every(
				(source) =>
					/environment:\n {6}name: (staging|production|\$\{\{ matrix\.environment \}\})/.test(source) &&
					source.includes("terraform-api-token: $" + "{{ secrets.TERRAFORM_API_TOKEN }}") &&
					!source.includes("uses: ./.github/workflows/cloudflare-terraform-"),
			),
		).toBe(true);
	});

	it("should fail with a clear configuration error before Terraform runs when an environment credential is missing", () => {
		const deploymentActionSource = _getActionSource("deploy-cloudflare-terraform-component");
		const driftActionSource = _getActionSource("detect-cloudflare-terraform-drift");

		expect({
			deployChecksHcpToken: deploymentActionSource.includes('if [[ -z "$HCP_TERRAFORM_TOKEN" ]]'),
			deployChecksReadToken: deploymentActionSource.includes('if [[ -z "$CLOUDFLARE_READ_TOKEN" ]]'),
			deployChecksWriteToken: deploymentActionSource.includes('if [[ -z "$CLOUDFLARE_WRITE_TOKEN" ]]'),
			driftChecksHcpToken: driftActionSource.includes('if [[ -z "$HCP_TERRAFORM_TOKEN" ]]'),
			driftChecksReadToken: driftActionSource.includes('if [[ -z "$CLOUDFLARE_READ_TOKEN" ]]'),
		}).toEqual({
			deployChecksHcpToken: true,
			deployChecksReadToken: true,
			deployChecksWriteToken: true,
			driftChecksHcpToken: true,
			driftChecksReadToken: true,
		});
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

	it("should install the centrally pinned Terraform version in deploy and drift workflows", () => {
		const terraformWorkflowSources = [
			_getActionSource("deploy-cloudflare-terraform-component"),
			_getActionSource("detect-cloudflare-terraform-drift"),
			_getWorkflowSource("cloudflare-terraform-validate.yml"),
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
		const terraformComponentsValidateSource = _getWorkflowSource("cloudflare-terraform-components-validate.yml");

		expect({
			discoversReusableModules: terraformComponentsValidateSource.includes("infra/cloudflare/modules/*"),
			runsModuleTests: terraformComponentsValidateSource.includes('terraform -chdir="$module_directory" test'),
		}).toEqual({
			discoversReusableModules: true,
			runsModuleTests: true,
		});
	});

	it("should validate pull request infrastructure without environments or secrets", () => {
		const pullRequestWorkflowSource = _getWorkflowSource("terraform-plan.yml");
		const componentValidationSource = _getWorkflowSource("cloudflare-terraform-components-validate.yml");
		const validationSource = _getWorkflowSource("cloudflare-terraform-validate.yml");
		const credentialFreeSources = [pullRequestWorkflowSource, componentValidationSource, validationSource];

		expect({
			usesCredentialFreeValidation: pullRequestWorkflowSource.includes(
				"./.github/workflows/cloudflare-terraform-components-validate.yml",
			),
			referencesEnvironment: credentialFreeSources.some((source) => /\benvironment:/.test(source)),
			referencesSecrets: credentialFreeSources.some((source) => /\bsecrets(?:\.|:)/.test(source)),
		}).toEqual({
			usesCredentialFreeValidation: true,
			referencesEnvironment: false,
			referencesSecrets: false,
		});
	});

	it("should never run authenticated speculative Terraform plans from pull requests", () => {
		const pullRequestWorkflowSource = _getWorkflowSource("terraform-plan.yml");

		expect({
			runsSpeculativePlans: pullRequestWorkflowSource.includes("speculative"),
			usesTerraformToken: pullRequestWorkflowSource.includes("TERRAFORM_API_TOKEN"),
			usesCloudflarePlanWorkflow: pullRequestWorkflowSource.includes(
				"uses: ./.github/workflows/cloudflare-terraform-components-deploy.yml",
			),
		}).toEqual({
			runsSpeculativePlans: false,
			usesTerraformToken: false,
			usesCloudflarePlanWorkflow: false,
		});
	});

	it("should isolate authenticated Terraform planning between deployment and drift workflows", () => {
		const terraformDeploySource = _getActionSource("deploy-cloudflare-terraform-component");
		const terraformDriftSource = _getActionSource("detect-cloudflare-terraform-drift");

		expect({
			deployCreatesSavedPlan: terraformDeploySource.includes("-out=tfplan"),
			deployAppliesSavedPlan: terraformDeploySource.includes("terraform apply"),
			driftDetectsChanges: terraformDriftSource.includes("-detailed-exitcode"),
			driftCanApply: terraformDriftSource.includes("terraform apply"),
		}).toEqual({
			deployCreatesSavedPlan: true,
			deployAppliesSavedPlan: true,
			driftDetectsChanges: true,
			driftCanApply: false,
		});
	});

	it("should lint only the Cloudflare infrastructure directory", () => {
		const terraformDeploySource = _getActionSource("deploy-cloudflare-terraform-component");

		expect({
			cloudflareDirectoryRuns: terraformDeploySource.match(/--chdir=infra\/cloudflare/g)?.length,
			parentDirectoryRuns: terraformDeploySource.includes("--chdir=.."),
		}).toEqual({
			cloudflareDirectoryRuns: 2,
			parentDirectoryRuns: false,
		});
	});

	it("should run read-only drift detection for staging and production", () => {
		const driftSource = _getWorkflowSource("terraform-drift.yml");

		expect({
			checksStaging: driftSource.includes("environment: [staging, production]"),
			checksProduction: driftSource.includes("environment: [staging, production]"),
			usesDedicatedDriftAction: driftSource.includes("uses: ./.github/actions/detect-cloudflare-terraform-drift"),
		}).toEqual({
			checksStaging: true,
			checksProduction: true,
			usesDedicatedDriftAction: true,
		});
	});

	it("should automatically deploy production after protected infrastructure deployment succeeds", () => {
		const productionDeploymentSource = _getWorkflowSource("deploy-production.yml");

		expect({
			hasPushTrigger: /\n {2}push:/.test(productionDeploymentSource),
			targetsMain: productionDeploymentSource.includes("branches: [main]"),
			deploysInfrastructure: productionDeploymentSource.includes(
				"uses: ./.github/actions/deploy-cloudflare-terraform-component",
			),
			migratesAfterInfrastructure: productionDeploymentSource.includes("needs: infrastructure"),
			deploysAfterMigration: productionDeploymentSource.includes("needs: migrate"),
		}).toEqual({
			hasPushTrigger: true,
			targetsMain: true,
			deploysInfrastructure: true,
			migratesAfterInfrastructure: true,
			deploysAfterMigration: true,
		});
	});

	it("should apply only the exact plan produced earlier in the same protected job", () => {
		const terraformDeploySource = _getActionSource("deploy-cloudflare-terraform-component");
		const planPosition = terraformDeploySource.indexOf("terraform plan -input=false -lock-timeout=5m -out=tfplan");
		const applyPosition = terraformDeploySource.indexOf("terraform apply -input=false -lock-timeout=5m tfplan");

		expect({
			createsPlanBeforeApply: planPosition > -1 && planPosition < applyPosition,
			hasArtifactHandoff: /upload-artifact|download-artifact|plan_artifact_name/.test(terraformDeploySource),
		}).toEqual({
			createsPlanBeforeApply: true,
			hasArtifactHandoff: false,
		});
	});
});
