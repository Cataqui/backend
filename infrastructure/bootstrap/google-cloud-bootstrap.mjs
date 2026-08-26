import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { log, repositoryRoot, runAsync } from "./bootstrap-runtime.mjs";
import { classifyGoogleProjectDiscovery, decideGoogleProject } from "./google-cloud-reconciliation.mjs";
import { getBootstrapSecret } from "./infisical-bootstrap.mjs";
import { ENVIRONMENTS } from "./reconciliation.mjs";

function _backendEnvironment(credentials) {
	return {
		...process.env,
		AWS_ACCESS_KEY_ID: credentials.accessKeyId,
		AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
		TF_IN_AUTOMATION: "1",
	};
}

async function _initializeRoot({ rootName, environment, credentials }) {
	const root = join(repositoryRoot, "infrastructure/opentofu/roots", rootName);
	await runAsync(
		"tofu",
		[
			"init",
			"-reconfigure",
			"-input=false",
			"-backend-config=../../backends/r2.s3.tfbackend",
			`-backend-config=../../environments/${environment}/${rootName}.s3.tfbackend`,
		],
		{ cwd: root, env: _backendEnvironment(credentials) },
	);
	return root;
}

async function _stateProjects({ root, environmentVariables }) {
	const state = await runAsync("tofu", ["state", "pull"], {
		cwd: root,
		env: environmentVariables,
		allowFailure: true,
	});
	if (state.status !== 0) {
		if (/No stored state|state snapshot was not found/i.test(state.stderr)) {
			return { projectIds: [], taintedProjectIds: [] };
		}
		throw new Error(`Unable to inspect Google project state: ${state.stderr.trim()}`);
	}
	const payload = JSON.parse(state.stdout);
	const instances = (payload.resources ?? [])
		.filter((resource) => resource.type === "google_project" && resource.name === "cataqui")
		.flatMap((resource) => resource.instances ?? []);
	return {
		projectIds: instances.map((instance) => instance.attributes?.project_id).filter(Boolean),
		taintedProjectIds: instances
			.filter((instance) => instance.status === "tainted")
			.map((instance) => instance.attributes?.project_id)
			.filter(Boolean),
	};
}

async function _discoverProject(projectId) {
	const result = await runAsync("gcloud", ["projects", "describe", projectId, "--format=json"], {
		allowFailure: true,
	});
	return classifyGoogleProjectDiscovery({
		projectId,
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	});
}

async function _applyRoot({ root, environmentVariables, variables = [] }) {
	const planPath = join(tmpdir(), `cataqui-bootstrap-${basename(root)}-${randomUUID()}.tfplan`);
	try {
		await runAsync("tofu", ["plan", "-input=false", "-out", planPath, ...variables], {
			cwd: root,
			env: environmentVariables,
		});
		await runAsync("tofu", ["apply", "-input=false", "-auto-approve", planPath], {
			cwd: root,
			env: environmentVariables,
		});
	} finally {
		if (existsSync(planPath)) unlinkSync(planPath);
	}
}

export async function getBackendCredentials(infisicalProjectId, infisicalToken, environment) {
	const accessKeyId = await getBootstrapSecret({
		projectId: infisicalProjectId,
		token: infisicalToken,
		environment,
		name: "R2_STATE_ACCESS_KEY_ID",
	});
	const secretAccessKey = await getBootstrapSecret({
		projectId: infisicalProjectId,
		token: infisicalToken,
		environment,
		name: "R2_STATE_SECRET_ACCESS_KEY",
	});
	if (!accessKeyId || !secretAccessKey)
		throw new Error(`Missing ${environment} R2 backend credentials after reconciliation.`);
	return { accessKeyId, secretAccessKey };
}

export async function reconcileGoogleProjects({ platforms, manifest }, infisicalProjectId, infisicalToken) {
	for (const environment of ENVIRONMENTS) {
		const credentials = await getBackendCredentials(infisicalProjectId, infisicalToken, environment);
		const root = await _initializeRoot({ rootName: "google-cloud-projects", environment, credentials });
		const environmentVariables = _backendEnvironment(credentials);
		const projectId = manifest.google_cloud.projects[`cataqui_${environment}`].id;
		const projectDiscovery = await _discoverProject(projectId);
		const stateProjects = await _stateProjects({ root, environmentVariables });
		const action = decideGoogleProject({
			expectedProjectId: projectId,
			expectedOrganizationId: platforms.google_cloud.organization_id,
			remoteStateProjectIds: stateProjects.projectIds,
			taintedProjectIds: stateProjects.taintedProjectIds,
			projectDiscovery,
		});
		log(`Google project ${environment}: ${action}.`);
		if (action === "recover") {
			await runAsync("tofu", ["untaint", "google_project.cataqui"], {
				cwd: root,
				env: environmentVariables,
			});
		}
		try {
			await _applyRoot({
				root,
				environmentVariables,
				variables: [`-var=environment=${environment}`, `-var=enable_imports=${action === "import"}`],
			});
		} catch (error) {
			if (action !== "claim") throw error;
			throw new Error(
				`Google could not inspect ${projectId}, and its atomic creation attempt failed. The project ID may already belong to another account, or the active account may lack Project Creator or Billing Account User access. ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		const verifiedStateProjects = await _stateProjects({ root, environmentVariables });
		const verifiedAction = decideGoogleProject({
			expectedProjectId: projectId,
			expectedOrganizationId: platforms.google_cloud.organization_id,
			remoteStateProjectIds: verifiedStateProjects.projectIds,
			taintedProjectIds: verifiedStateProjects.taintedProjectIds,
			projectDiscovery: await _discoverProject(projectId),
		});
		if (verifiedAction !== "reconcile") {
			throw new Error(`Google project ${projectId} was not owned by the expected state after ${action}.`);
		}
	}
}

export async function applyGoogleGithubAuth(infisicalProjectId, infisicalToken) {
	const credentials = await getBackendCredentials(infisicalProjectId, infisicalToken, "production");
	const root = await _initializeRoot({
		rootName: "google-cloud-github-auth",
		environment: "production",
		credentials,
	});
	const environmentVariables = _backendEnvironment(credentials);
	await _applyRoot({ root, environmentVariables });
	const output = JSON.parse(
		(await runAsync("tofu", ["output", "-json"], { cwd: root, env: environmentVariables })).stdout,
	);
	return {
		provider: output.workload_identity_provider.value,
	};
}
