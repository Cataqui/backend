import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const workflowsDirectory = resolve(process.cwd(), ".github/workflows");
const actionsDirectory = resolve(process.cwd(), ".github/actions");
const cloudflareInfrastructureDirectory = resolve(process.cwd(), "infrastructure/cloudflare");
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

function _getWorkflowJobSource(workflowSource: string, jobId: string): string {
	const jobDeclarations = [...workflowSource.matchAll(/^ {2}([a-z0-9_-]+):\n/gm)];
	const jobIndex = jobDeclarations.findIndex((match) => match[1] === jobId);
	const jobDeclaration = jobDeclarations[jobIndex];

	if (jobDeclaration?.index === undefined) {
		throw new Error(`Expected workflow job ${jobId} to exist.`);
	}

	return workflowSource.slice(jobDeclaration.index, jobDeclarations[jobIndex + 1]?.index ?? workflowSource.length);
}

describe("Cloudflare Terraform workflow security", () => {
	it("should run selective CI for every monorepo ownership and toolchain boundary", () => {
		const continuousIntegrationSource = _getWorkflowSource("ci.yml");
		const requiredPathScopes = [
			"apps/**",
			"packages/**",
			"infrastructure/**",
			"scripts/**",
			"test/**",
			".agents/skills/**",
			".github/**",
			"package.json",
			"pnpm-lock.yaml",
			"pnpm-workspace.yaml",
			"skills-lock.json",
			"biome.json",
			"tsconfig*.json",
			"vitest*.ts",
			".gitattributes",
		];

		expect(
			requiredPathScopes.every((pathScope) => continuousIntegrationSource.split(`- '${pathScope}'`).length - 1 === 2),
		).toBe(true);
	});

	it("should validate repository contracts and each affected workspace through the dependency graph", () => {
		const continuousIntegrationSource = _getWorkflowSource("ci.yml");
		const affectedScopeSource = _getWorkflowJobSource(continuousIntegrationSource, "affected_scope");
		const repositorySource = _getWorkflowJobSource(continuousIntegrationSource, "repository");
		const workspaceSource = _getWorkflowJobSource(continuousIntegrationSource, "workspace");

		expect({
			resolvesChangedPaths: affectedScopeSource.includes("node scripts/affected-workspaces.mjs"),
			checksDiffWhitespace: affectedScopeSource.includes("git diff --check"),
			lintsRepository: repositorySource.includes("run: pnpm lint:check"),
			testsRepositoryContracts: repositorySource.includes("run: pnpm test:repo"),
			usesAffectedWorkspaceMatrix: workspaceSource.includes(
				"workspace: $" + "{{ fromJSON(needs.affected_scope.outputs.validation_workspaces) }}",
			),
			buildsDependenciesFirst: workspaceSource.includes('run: pnpm --filter "$WORKSPACE..." run build'),
			typechecksWorkspace: workspaceSource.includes('run: pnpm --filter "$WORKSPACE" run typecheck'),
			enforcesWorkspaceCoverage: workspaceSource.includes('run: pnpm --filter "$WORKSPACE" run test:cov'),
		}).toEqual({
			resolvesChangedPaths: true,
			checksDiffWhitespace: true,
			lintsRepository: true,
			testsRepositoryContracts: true,
			usesAffectedWorkspaceMatrix: true,
			buildsDependenciesFirst: true,
			typechecksWorkspace: true,
			enforcesWorkspaceCoverage: true,
		});
	});

	it("should use repository-local api names for every HCP Terraform workspace", () => {
		const terraformWorkspaceDeclarations = Object.values(workflowSources).flatMap((source) =>
			[...source.matchAll(/^\s*TF_WORKSPACE:\s*(.+)$/gm)].map((match) => (match[1] ?? "").trim()),
		);

		expect({
			hasEveryExpectedWorkspace: terraformWorkspaceDeclarations.length === 9,
			allUseApiPrefix: terraformWorkspaceDeclarations.every((workspace) => workspace.startsWith("api-")),
			usesRedundantProjectPrefix: terraformWorkspaceDeclarations.some((workspace) =>
				workspace.startsWith("cataqui-api-"),
			),
		}).toEqual({
			hasEveryExpectedWorkspace: true,
			allUseApiPrefix: true,
			usesRedundantProjectPrefix: false,
		});
	});

	it("should pin every GitHub-hosted runner and avoid persisting checkout credentials", () => {
		expect(
			Object.values(workflowSources).every(
				(source) =>
					!source.includes("ubuntu-latest") &&
					[...source.matchAll(/uses: actions\/checkout@[0-9a-f]{40}/g)].length ===
						[...source.matchAll(/persist-credentials: false/g)].length,
			),
		).toBe(true);
	});

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
		const combinedAutomationSource = [...Object.values(workflowSources), ...Object.values(actionSources)].join("\n");

		expect({
			usesTerraformApiToken: /\bTERRAFORM_API_TOKEN\b/.test(combinedAutomationSource),
			usesLegacyTokenName: /\bTF_API_TOKEN\b/.test(combinedAutomationSource),
		}).toEqual({
			usesTerraformApiToken: true,
			usesLegacyTokenName: false,
		});
	});

	it("should read the Terraform API token only inside environment-bound infrastructure jobs", () => {
		const workflowsUsingTerraformApiToken = Object.entries(workflowSources)
			.filter(([, source]) => source.includes("steps.infisical.outputs.terraform_api_token"))
			.map(([fileName, source]) => ({
				fileName: fileName,
				hasEnvironmentBoundary: /environment:\n {6}name: (staging|production|\$\{\{ matrix\.environment \}\})/.test(
					source,
				),
				forwardsToken: source.includes("terraform-api-token: $" + "{{ steps.infisical.outputs.terraform_api_token }}"),
			}))
			.sort(({ fileName: firstFileName }, { fileName: secondFileName }) => firstFileName.localeCompare(secondFileName));

		expect(workflowsUsingTerraformApiToken).toEqual([
			{
				fileName: "deploy-production.yml",
				forwardsToken: true,
				hasEnvironmentBoundary: true,
			},
			{
				fileName: "deploy-staging.yml",
				forwardsToken: true,
				hasEnvironmentBoundary: true,
			},
			{
				fileName: "terraform-drift.yml",
				forwardsToken: true,
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

	it("should select the Cloudflare read token through Infisical after entering the target GitHub environment", () => {
		const combinedWorkflowSource = Object.values(workflowSources).join("\n");
		const terraformDriftSource = _getWorkflowSource("terraform-drift.yml");

		expect({
			usesEnvironmentScopedName: terraformDriftSource.includes("profile: cloudflare-terraform-drift"),
			selectsInputEnvironment: terraformDriftSource.includes(`environment:\n      name: \${{ matrix.environment }}`),
			avoidsWriteCredentialProfile: !terraformDriftSource.includes("profile: cloudflare-terraform-apply"),
			hasEnvironmentSpecificNames: /CLOUDFLARE_TERRAFORM_(STAGING|PRODUCTION)_READ_API_TOKEN/.test(
				combinedWorkflowSource,
			),
		}).toEqual({
			usesEnvironmentScopedName: true,
			selectsInputEnvironment: true,
			avoidsWriteCredentialProfile: true,
			hasEnvironmentSpecificNames: false,
		});
	});

	it("should expose the write-capable Cloudflare token only inside the protected deployment workflow", () => {
		const workflowsUsingEditToken = Object.entries(workflowSources)
			.filter(([, source]) => source.includes("profile: cloudflare-terraform-apply"))
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

	it("should reject a first Cloudflare import that would also change the live resource", () => {
		const terraformDeploySource = _getActionSource("deploy-cloudflare-terraform-component");
		const mutatingImportGuardPosition = terraformDeploySource.indexOf(
			"Reject Cloudflare imports that would also change live resources",
		);
		const applyPosition = terraformDeploySource.indexOf("terraform apply -input=false -lock-timeout=5m tfplan");

		expect({
			checksCloudflareProvider: terraformDeploySource.includes(
				'select(.provider_name == "registry.terraform.io/cloudflare/cloudflare")',
			),
			checksImportMetadata: terraformDeploySource.includes("select(.change.importing != null)"),
			rejectsMutatingActions: terraformDeploySource.includes('select(.change.actions != ["no-op"])'),
			failsBeforeApply:
				mutatingImportGuardPosition > -1 &&
				mutatingImportGuardPosition < applyPosition &&
				terraformDeploySource.includes("A first Cloudflare import cannot also change the live resource"),
		}).toEqual({
			checksCloudflareProvider: true,
			checksImportMetadata: true,
			rejectsMutatingActions: true,
			failsBeforeApply: true,
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
				componentDiscoveryActionSource.includes("infrastructure/cloudflare/components.json"),
			].every(Boolean),
		).toBe(true);
	});

	it("should fetch Infisical credentials in the same matrix jobs that run Terraform", () => {
		const environmentBoundTerraformSources = [
			_getWorkflowSource("deploy-staging.yml"),
			_getWorkflowSource("deploy-production.yml"),
			_getWorkflowSource("terraform-drift.yml"),
		];

		expect(
			environmentBoundTerraformSources.every(
				(source) =>
					/environment:\n {6}name: (staging|production|\$\{\{ matrix\.environment \}\})/.test(source) &&
					source.includes("uses: ./.github/actions/load-infisical-secrets") &&
					source.includes("terraform-api-token: $" + "{{ steps.infisical.outputs.terraform_api_token }}") &&
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
		const continuousIntegrationSource = _getWorkflowSource("ci.yml");
		const terraformPlanSource = _getWorkflowSource("terraform-plan.yml");
		const stagingDeploymentSource = _getWorkflowSource("deploy-staging.yml");
		const productionDeploymentSource = _getWorkflowSource("deploy-production.yml");

		expect({
			ciCoversAllWorkflowAutomation: continuousIntegrationSource.includes("- '.github/**'"),
			terraformValidationCoversActions: terraformPlanSource.includes("- '.github/actions/**'"),
			stagingDeliveryCoversActions: stagingDeploymentSource.includes("- '.github/actions/**'"),
			productionDeliveryCoversActions: productionDeploymentSource.includes("- '.github/actions/**'"),
		}).toEqual({
			ciCoversAllWorkflowAutomation: true,
			terraformValidationCoversActions: true,
			stagingDeliveryCoversActions: true,
			productionDeliveryCoversActions: true,
		});
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
				dependabotSource.includes(`- /infrastructure/cloudflare/${component}`),
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
					source.includes("infrastructure/cloudflare/.terraform-version") &&
					source.includes("terraform_version: $" + "{{ steps.terraform-version.outputs.version }}"),
			),
		).toBe(true);
	});

	it("should run every Terraform root on stable Terraform 1.15 while reusable modules remain compatible", () => {
		const pinnedTerraformVersion = readFileSync(
			resolve(cloudflareInfrastructureDirectory, ".terraform-version"),
			"utf8",
		).trim();
		const registeredComponents = JSON.parse(
			readFileSync(resolve(cloudflareInfrastructureDirectory, "components.json"), "utf8"),
		) as string[];
		const rootVersionConstraints = registeredComponents.map((component) =>
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
			discoversReusableModules: terraformComponentsValidateSource.includes("infrastructure/cloudflare/modules/*"),
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
			cloudflareDirectoryRuns: terraformDeploySource.match(/--chdir=infrastructure\/cloudflare/g)?.length,
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

	it("should resolve and order selective production deployments through explicit readiness gates", () => {
		const productionDeploymentSource = _getWorkflowSource("deploy-production.yml");
		const affectedScopeSource = _getWorkflowJobSource(productionDeploymentSource, "affected-scope");
		const cloudflareInfrastructureSource = _getWorkflowJobSource(
			productionDeploymentSource,
			"infrastructure-cloudflare",
		);
		const neonInfrastructureSource = _getWorkflowJobSource(productionDeploymentSource, "infrastructure-neon");
		const upstashInfrastructureSource = _getWorkflowJobSource(productionDeploymentSource, "infrastructure-upstash");
		const infrastructureReadinessSource = _getWorkflowJobSource(productionDeploymentSource, "infrastructure-readiness");
		const migrateSource = _getWorkflowJobSource(productionDeploymentSource, "migrate");
		const deployApiSource = _getWorkflowJobSource(productionDeploymentSource, "deploy-api");
		const deployWebhooksSource = _getWorkflowJobSource(productionDeploymentSource, "deploy-webhooks");
		const deployGeosearchSource = _getWorkflowJobSource(productionDeploymentSource, "deploy-geosearch");

		expect({
			hasPushTrigger: /\n {2}push:/.test(productionDeploymentSource),
			targetsMain: productionDeploymentSource.includes("branches: [main]"),
			resolvesAffectedScope:
				affectedScopeSource.includes("node scripts/affected-workspaces.mjs") &&
				affectedScopeSource.includes('--base "$base_sha"') &&
				affectedScopeSource.includes('--head "$EVENT_HEAD_SHA"'),
			selectsCloudflareComponents:
				cloudflareInfrastructureSource.includes(
					"component: $" + "{{ fromJSON(needs.infrastructure-components-cloudflare.outputs.components) }}",
				) && cloudflareInfrastructureSource.includes("needs.infrastructure-components-cloudflare.result == 'success'"),
			selectsNeon: neonInfrastructureSource.includes("needs.affected-scope.outputs.deploy_neon == 'true'"),
			selectsUpstash: upstashInfrastructureSource.includes("needs.affected-scope.outputs.deploy_upstash == 'true'"),
			joinsSelectedInfrastructure: [
				"infrastructure-components-cloudflare",
				"infrastructure-cloudflare",
				"infrastructure-neon",
				"infrastructure-upstash",
			].every((jobId) => infrastructureReadinessSource.includes(`- ${jobId}`)),
			migratesAfterReadiness:
				migrateSource.includes("needs: [affected-scope, infrastructure-readiness]") &&
				migrateSource.includes("needs.affected-scope.outputs.run_migrations == 'true'") &&
				migrateSource.match(/pnpm --filter @cataqui\/api prisma:migrate:deploy/g)?.length === 2,
			deploysApiAfterMigration:
				deployApiSource.includes("needs: [affected-scope, migrate]") &&
				deployApiSource.includes("needs.migrate.result == 'success'"),
			ordersSelectedApiBeforeWebhooks:
				deployWebhooksSource.includes("needs: [affected-scope, infrastructure-readiness, deploy-api]") &&
				deployWebhooksSource.includes("needs.deploy-api.result == 'success'"),
			ordersSelectedApiBeforeGeosearch:
				deployGeosearchSource.includes("needs: [affected-scope, infrastructure-readiness, deploy-api]") &&
				deployGeosearchSource.includes("needs.deploy-api.result == 'success'"),
			allowsIndependentWorkerDeployment: [deployWebhooksSource, deployGeosearchSource].every((source) =>
				source.includes("needs.affected-scope.outputs.deploy_api != 'true' && needs.deploy-api.result == 'skipped'"),
			),
		}).toEqual({
			hasPushTrigger: true,
			targetsMain: true,
			resolvesAffectedScope: true,
			selectsCloudflareComponents: true,
			selectsNeon: true,
			selectsUpstash: true,
			joinsSelectedInfrastructure: true,
			migratesAfterReadiness: true,
			deploysApiAfterMigration: true,
			ordersSelectedApiBeforeWebhooks: true,
			ordersSelectedApiBeforeGeosearch: true,
			allowsIndependentWorkerDeployment: true,
		});
	});

	it("should evaluate selected deployments after optional infrastructure jobs are skipped", () => {
		const deploymentWorkflowSources = [
			_getWorkflowSource("deploy-staging.yml"),
			_getWorkflowSource("deploy-production.yml"),
		];

		expect(
			deploymentWorkflowSources.every((source) => {
				const validationGateSource = _getWorkflowJobSource(source, "validation-gate");
				const infrastructureReadinessSource = _getWorkflowJobSource(source, "infrastructure-readiness");
				const migrationSource = _getWorkflowJobSource(source, "migrate");
				const apiDeploymentSource = _getWorkflowJobSource(source, "deploy-api");
				const webhooksDeploymentSource = _getWorkflowJobSource(source, "deploy-webhooks");
				const geosearchDeploymentSource = _getWorkflowJobSource(source, "deploy-geosearch");
				const selectedMutationSources = [
					migrationSource,
					apiDeploymentSource,
					webhooksDeploymentSource,
					geosearchDeploymentSource,
				];

				return (
					validationGateSource.includes("\n    if: always()\n") &&
					validationGateSource.includes('if [[ "$AFFECTED_SCOPE_RESULT" != "success" ]]') &&
					validationGateSource.includes('for result in "$REPOSITORY_RESULT" "$WORKSPACES_RESULT"') &&
					validationGateSource.includes('"$result" != "success" && "$result" != "skipped"') &&
					infrastructureReadinessSource.includes("\n    if: always()\n") &&
					infrastructureReadinessSource.includes('if [[ "$VALIDATION_RESULT" != "success" ]]') &&
					infrastructureReadinessSource.includes(
						'if [[ "$DEPLOY_AI_GATEWAY" == "true" || "$DEPLOY_QUEUES" == "true" ]]',
					) &&
					infrastructureReadinessSource.includes(
						'"$DISCOVERY_RESULT" != "success" || "$CLOUDFLARE_RESULT" != "success"',
					) &&
					infrastructureReadinessSource.includes('"$DEPLOY_NEON" == "true" && "$NEON_RESULT" != "success"') &&
					infrastructureReadinessSource.includes('"$DEPLOY_UPSTASH" == "true" && "$UPSTASH_RESULT" != "success"') &&
					selectedMutationSources.every((jobSource) => /if: >-\n\s+\$\{\{\n\s+!cancelled\(\) &&/.test(jobSource)) &&
					migrationSource.includes("needs: [affected-scope, infrastructure-readiness]") &&
					migrationSource.includes("needs.infrastructure-readiness.result == 'success'") &&
					migrationSource.includes("needs.affected-scope.outputs.run_migrations == 'true'") &&
					apiDeploymentSource.includes("needs: [affected-scope, migrate]") &&
					apiDeploymentSource.includes("needs.affected-scope.outputs.deploy_api == 'true'") &&
					apiDeploymentSource.includes("needs.migrate.result == 'success'") &&
					[webhooksDeploymentSource, geosearchDeploymentSource].every(
						(jobSource) =>
							jobSource.includes("needs.infrastructure-readiness.result == 'success'") &&
							jobSource.includes(
								"needs.affected-scope.outputs.deploy_api != 'true' && needs.deploy-api.result == 'skipped'",
							),
					)
				);
			}),
		).toBe(true);
	});

	it("should resolve deployment scope for every monorepo runtime and build contract", () => {
		const deploymentWorkflowSources = [
			_getWorkflowSource("deploy-staging.yml"),
			_getWorkflowSource("deploy-production.yml"),
		];
		const runtimeBuildScopes = [
			"'apps/**'",
			"'packages/**'",
			"'package.json'",
			"'pnpm-lock.yaml'",
			"'pnpm-workspace.yaml'",
			"'tsconfig*.json'",
			"'vitest*.ts'",
			"'.dockerignore'",
		];
		const workspaceDependencyBuilds = [
			'pnpm --filter "@cataqui/api^..." run build',
			'pnpm --filter "@cataqui/webhooks-worker^..." run build',
			'pnpm --filter "@cataqui/geosearch-worker^..." run build',
		];

		expect(
			deploymentWorkflowSources.every((source) =>
				[
					source.includes("node scripts/affected-workspaces.mjs"),
					runtimeBuildScopes.every((runtimeBuildScope) => source.includes(runtimeBuildScope)),
					workspaceDependencyBuilds.every((dependencyBuild) => source.includes(dependencyBuild)),
				].every(Boolean),
			),
		).toBe(true);
	});

	it("should deploy the API and webhook Workers with isolated secrets and resource-appropriate recovery", () => {
		const deploymentWorkflowSources = [
			_getWorkflowSource("deploy-staging.yml"),
			_getWorkflowSource("deploy-production.yml"),
		];
		const apiDeploymentActionSource = _getActionSource("deploy-cloudflare-api-worker");
		const webhooksDeploymentActionSource = _getActionSource("deploy-cloudflare-webhooks-worker");
		const apiWranglerSource = readFileSync(resolve(process.cwd(), "apps/api/wrangler.jsonc"), "utf8");

		expect({
			describesApiDeploymentWithAutomaticRollback:
				apiDeploymentActionSource.startsWith("name: Deploy and verify Cloudflare API Worker\n") &&
				apiDeploymentActionSource.includes("roll back an unhealthy Worker and Container deployment"),
			usesBothDeploymentActions: deploymentWorkflowSources.every(
				(source) =>
					source.includes("uses: ./.github/actions/deploy-cloudflare-api-worker") &&
					source.includes("uses: ./.github/actions/deploy-cloudflare-webhooks-worker"),
			),
			usesStrictImmediateContainerDeployment: apiDeploymentActionSource.includes(
				"deploy --strict --cwd apps/api\n          --config wrangler.jsonc --containers-rollout immediate",
			),
			protectsBothEphemeralSecretFiles: [apiDeploymentActionSource, webhooksDeploymentActionSource].every(
				(source) =>
					source.includes("umask 077") &&
					source.includes("jq -n '{") &&
					source.includes('run: rm -f -- "$SECRETS_FILE"'),
			),
			isolatesWhatsappSecrets:
				!apiDeploymentActionSource.includes("WHATSAPP_AUTH_ACCESS_TOKEN") &&
				!apiDeploymentActionSource.includes("META_APP_SECRET: env.META_APP_SECRET") &&
				webhooksDeploymentActionSource.includes("META_APP_SECRET: env.META_APP_SECRET") &&
				webhooksDeploymentActionSource.includes(
					"WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN: env.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN",
				) &&
				!webhooksDeploymentActionSource.includes("WHATSAPP_AUTH_ACCESS_TOKEN"),
			deploysRefreshTokenHmacKeyV1Base64url: apiDeploymentActionSource.includes(
				"AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL: env.AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL",
			),
			deploysMicroservicesAuthPrivateKeyV1: apiDeploymentActionSource.includes(
				"MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64: env.MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64",
			),
			keepsRedisCredentialsOutOfWebhooks: !webhooksDeploymentActionSource.includes("UPSTASH_REDIS"),
			verifiesBothReadinessContracts:
				apiDeploymentActionSource.includes("/v1/health") &&
				webhooksDeploymentActionSource.includes('response_status" == "403"'),
			rollsBackFailedApiReadiness:
				apiDeploymentActionSource.includes("steps.readiness.outcome == 'failure'") &&
				apiDeploymentActionSource.includes("rollback --cwd apps/api"),
			verifiesApiReadinessAfterRollback:
				apiDeploymentActionSource.includes("Verify the API readiness after rollback") &&
				apiDeploymentActionSource.includes("steps.rollback.outcome == 'success'") &&
				apiDeploymentActionSource.includes("The API remained unhealthy after rollback"),
			rollsBackFailedWebhooksReadiness:
				webhooksDeploymentActionSource.includes("steps.readiness.outcome == 'failure'") &&
				webhooksDeploymentActionSource.includes("rollback --cwd apps/workers/webhooks"),
			keepsProgressiveContainerStepsAvailableForLaterDeployments:
				apiWranglerSource.includes('"rollout_step_percentage": [10, 50, 100]') &&
				apiWranglerSource.includes('"rollout_step_percentage": [10, 25, 50, 100]'),
		}).toEqual({
			describesApiDeploymentWithAutomaticRollback: true,
			usesBothDeploymentActions: true,
			usesStrictImmediateContainerDeployment: true,
			protectsBothEphemeralSecretFiles: true,
			isolatesWhatsappSecrets: true,
			deploysRefreshTokenHmacKeyV1Base64url: true,
			deploysMicroservicesAuthPrivateKeyV1: true,
			keepsRedisCredentialsOutOfWebhooks: true,
			verifiesBothReadinessContracts: true,
			rollsBackFailedApiReadiness: true,
			verifiesApiReadinessAfterRollback: true,
			rollsBackFailedWebhooksReadiness: true,
			keepsProgressiveContainerStepsAvailableForLaterDeployments: true,
		});
	});

	it("should identify the platform in every provider-specific workflow job ID", () => {
		const stagingDeploymentSource = _getWorkflowSource("deploy-staging.yml");
		const productionDeploymentSource = _getWorkflowSource("deploy-production.yml");
		const driftSource = _getWorkflowSource("terraform-drift.yml");
		const planSource = _getWorkflowSource("terraform-plan.yml");
		const cloudflareComponentsValidationSource = _getWorkflowSource("cloudflare-terraform-components-validate.yml");
		const cloudflareValidationSource = _getWorkflowSource("cloudflare-terraform-validate.yml");
		const upstashValidationSource = _getWorkflowSource("upstash-terraform-validate.yml");
		const neonValidationSource = _getWorkflowSource("neon-terraform-validate.yml");

		expect({
			staging: [
				"infrastructure-components-cloudflare",
				"infrastructure-cloudflare",
				"infrastructure-neon",
				"infrastructure-upstash",
			].every((jobId) => stagingDeploymentSource.includes(`  ${jobId}:`)),
			production: [
				"infrastructure-components-cloudflare",
				"infrastructure-cloudflare",
				"infrastructure-neon",
				"infrastructure-upstash",
			].every((jobId) => productionDeploymentSource.includes(`  ${jobId}:`)),
			drift: ["components-cloudflare", "detect-cloudflare", "detect-neon", "detect-upstash"].every((jobId) =>
				driftSource.includes(`  ${jobId}:`),
			),
			plan: ["validate-cloudflare", "validate-neon", "validate-upstash"].every((jobId) =>
				planSource.includes(`  ${jobId}:`),
			),
			cloudflareComponentsValidation: [
				"discover-cloudflare",
				"validate-modules-cloudflare",
				"validate-cloudflare",
			].every((jobId) => cloudflareComponentsValidationSource.includes(`  ${jobId}:`)),
			cloudflareValidation: cloudflareValidationSource.includes("  validate-cloudflare:"),
			upstashValidation: upstashValidationSource.includes("  validate-upstash:"),
			neonValidation: neonValidationSource.includes("  validate-neon:"),
		}).toEqual({
			staging: true,
			production: true,
			drift: true,
			plan: true,
			cloudflareComponentsValidation: true,
			cloudflareValidation: true,
			upstashValidation: true,
			neonValidation: true,
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
