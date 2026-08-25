import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { log, repositoryRoot, run } from "./bootstrap-runtime.mjs";
import { decideGoogleProject } from "./google-cloud-reconciliation.mjs";
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

function _initializeRoot({ rootName, environment, credentials }) {
	const root = join(repositoryRoot, "infrastructure/opentofu/roots", rootName);
	run(
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

function _stateProjectIds({ root, environmentVariables }) {
	const state = run("tofu", ["state", "pull"], { cwd: root, env: environmentVariables, allowFailure: true });
	if (state.status !== 0) {
		if (/No stored state|state snapshot was not found/i.test(state.stderr)) return [];
		throw new Error(`Unable to inspect Google project state: ${state.stderr.trim()}`);
	}
	const payload = JSON.parse(state.stdout);
	return (payload.resources ?? [])
		.filter((resource) => resource.type === "google_project" && resource.name === "cataqui")
		.flatMap((resource) => resource.instances ?? [])
		.map((instance) => instance.attributes?.project_id)
		.filter(Boolean);
}

function _discoverProject(projectId) {
	const result = run("gcloud", ["projects", "describe", projectId, "--format=json"], { allowFailure: true });
	if (result.status === 0) return JSON.parse(result.stdout);
	if (/NOT_FOUND|not found|does not exist/i.test(`${result.stdout}\n${result.stderr}`)) return undefined;
	throw new Error(`Unable to determine ownership of Google project ${projectId}: ${result.stderr.trim()}`);
}

function _applyRoot({ root, environmentVariables, variables = [] }) {
	const planPath = join(tmpdir(), `cataqui-bootstrap-${basename(root)}-${randomUUID()}.tfplan`);
	try {
		run("tofu", ["plan", "-input=false", "-out", planPath, ...variables], { cwd: root, env: environmentVariables });
		run("tofu", ["apply", "-input=false", "-auto-approve", planPath], { cwd: root, env: environmentVariables });
	} finally {
		if (existsSync(planPath)) unlinkSync(planPath);
	}
}

export async function getBackendCredentials(platforms, infisicalToken, environment) {
	const accessKeyId = await getBootstrapSecret({
		platforms,
		token: infisicalToken,
		environment,
		name: "R2_STATE_ACCESS_KEY_ID",
	});
	const secretAccessKey = await getBootstrapSecret({
		platforms,
		token: infisicalToken,
		environment,
		name: "R2_STATE_SECRET_ACCESS_KEY",
	});
	if (!accessKeyId || !secretAccessKey)
		throw new Error(`Missing ${environment} R2 backend credentials after reconciliation.`);
	return { accessKeyId, secretAccessKey };
}

export async function reconcileGoogleProjects(platforms, infisicalToken) {
	for (const environment of ENVIRONMENTS) {
		const credentials = await getBackendCredentials(platforms, infisicalToken, environment);
		const root = _initializeRoot({ rootName: "google-cloud-projects", environment, credentials });
		const environmentVariables = _backendEnvironment(credentials);
		const projectId = platforms.google_cloud.projects[`cataqui_${environment}`];
		const action = decideGoogleProject({
			expectedProjectId: projectId,
			expectedOrganizationId: platforms.google_cloud.organization_id,
			remoteStateProjectIds: _stateProjectIds({ root, environmentVariables }),
			discoveredProject: _discoverProject(projectId),
		});
		log(`Google project ${environment}: ${action}.`);
		_applyRoot({
			root,
			environmentVariables,
			variables: [`-var=environment=${environment}`, `-var=enable_imports=${action === "import"}`],
		});
	}
}

export async function applyGoogleGithubAuth(platforms, infisicalToken) {
	const credentials = await getBackendCredentials(platforms, infisicalToken, "production");
	const root = _initializeRoot({
		rootName: "google-cloud-github-auth",
		environment: "production",
		credentials,
	});
	const environmentVariables = _backendEnvironment(credentials);
	_applyRoot({ root, environmentVariables });
	const output = JSON.parse(run("tofu", ["output", "-json"], { cwd: root, env: environmentVariables }).stdout);
	return {
		provider: output.workload_identity_provider.value,
	};
}
