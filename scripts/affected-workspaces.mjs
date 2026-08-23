import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WORKSPACE_NAMES = {
	apiInternalIngress: "@cataqui/api-internal-ingress",
	microservicesAuthContracts: "@cataqui/microservices-auth-contracts",
	api: "@cataqui/api",
	webhooks: "@cataqui/webhooks-worker",
	geosearch: "@cataqui/geosearch-worker",
};

const WORKSPACE_ORDER = ["apiInternalIngress", "microservicesAuthContracts", "api", "webhooks", "geosearch"];

const INFRASTRUCTURE_ORDER = ["aiGateway", "queues", "neon", "upstash"];
const MANUAL_TARGETS = new Set(["all", "api", "webhooks", "geosearch", "infrastructure"]);

function _createEmptyScope({ changedPaths, manualTarget }) {
	return {
		mode: manualTarget === undefined ? "changes" : "manual",
		manualTarget: manualTarget ?? null,
		changedPaths: changedPaths,
		validate: {
			repository: changedPaths.length > 0 || manualTarget !== undefined,
			api: false,
			webhooks: false,
			geosearch: false,
			apiInternalIngress: false,
			microservicesAuthContracts: false,
			infrastructure: {
				aiGateway: false,
				queues: false,
				neon: false,
				upstash: false,
			},
		},
		deploy: {
			api: false,
			webhooks: false,
			geosearch: false,
			infrastructure: {
				aiGateway: false,
				queues: false,
				neon: false,
				upstash: false,
			},
		},
	};
}

function _normalizeChangedPaths(changedPaths) {
	return [
		...new Set(
			changedPaths
				.flatMap((changedPath) => changedPath.split(/\r?\n/u))
				.map((changedPath) => changedPath.trim().replaceAll("\\", "/").replace(/^\.\//u, ""))
				.filter((changedPath) => changedPath.length > 0),
		),
	].sort();
}

function _isDocumentationOrSkillPath(changedPath) {
	return (
		changedPath.endsWith(".md") ||
		changedPath === "LICENSE" ||
		changedPath.startsWith("docs/") ||
		changedPath.includes("/.agents/") ||
		changedPath.startsWith(".agents/") ||
		changedPath.endsWith("skills-lock.json")
	);
}

function _isTestOnlyPath(changedPath) {
	return (
		changedPath.startsWith("test/") ||
		changedPath.includes("/test/") ||
		/\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(changedPath)
	);
}

function _markWorkspace(scope, workspace, { deploy }) {
	scope.validate[workspace] = true;
	if (deploy && workspace !== "apiInternalIngress" && workspace !== "microservicesAuthContracts") {
		scope.deploy[workspace] = true;
	}
}

function _markApiInternalIngress(scope, { deploy }) {
	_markWorkspace(scope, "apiInternalIngress", { deploy: false });
	_markWorkspace(scope, "api", { deploy: deploy });
	_markWorkspace(scope, "webhooks", { deploy: deploy });
}

function _markMicroservicesAuthContracts(scope, { deploy }) {
	_markWorkspace(scope, "microservicesAuthContracts", { deploy: false });
	_markWorkspace(scope, "api", { deploy: deploy });
	_markWorkspace(scope, "geosearch", { deploy: deploy });
}

function _markAllWorkspaces(scope, { deploy }) {
	_markWorkspace(scope, "apiInternalIngress", { deploy: false });
	_markWorkspace(scope, "microservicesAuthContracts", { deploy: false });
	_markWorkspace(scope, "api", { deploy: deploy });
	_markWorkspace(scope, "webhooks", { deploy: deploy });
	_markWorkspace(scope, "geosearch", { deploy: deploy });
}

function _markInfrastructure(scope, component, { deploy }) {
	scope.validate.infrastructure[component] = true;
	if (!deploy) return;

	scope.deploy.infrastructure[component] = true;
	_markWorkspace(scope, "api", { deploy: true });
}

function _markAllInfrastructure(scope, { deploy }) {
	for (const component of INFRASTRUCTURE_ORDER) {
		_markInfrastructure(scope, component, { deploy: deploy });
	}
}

function _markAllCloudflareInfrastructure(scope, { deploy }) {
	_markInfrastructure(scope, "aiGateway", { deploy: deploy });
	_markInfrastructure(scope, "queues", { deploy: deploy });
}

function _markInfrastructurePath(scope, changedPath, { deploy }) {
	if (
		changedPath.startsWith("infrastructure/cloudflare/ai-gateway/") ||
		changedPath.startsWith("infrastructure/cloudflare/modules/ai-gateway/")
	) {
		_markInfrastructure(scope, "aiGateway", { deploy: deploy });
		return;
	}

	if (
		changedPath.startsWith("infrastructure/cloudflare/queues/") ||
		changedPath.startsWith("infrastructure/cloudflare/modules/queue-pair/")
	) {
		_markInfrastructure(scope, "queues", { deploy: deploy });
		return;
	}

	if (changedPath.startsWith("infrastructure/neon/")) {
		_markInfrastructure(scope, "neon", { deploy: deploy });
		return;
	}

	if (changedPath.startsWith("infrastructure/upstash/")) {
		_markInfrastructure(scope, "upstash", { deploy: deploy });
		return;
	}

	if (changedPath.startsWith("infrastructure/cloudflare/")) {
		_markAllCloudflareInfrastructure(scope, { deploy: deploy });
		return;
	}

	_markAllInfrastructure(scope, { deploy: deploy });
}

function _markManualTarget(scope, manualTarget) {
	switch (manualTarget) {
		case "all":
			_markAllInfrastructure(scope, { deploy: true });
			_markAllWorkspaces(scope, { deploy: true });
			return;
		case "api":
			_markWorkspace(scope, "api", { deploy: true });
			return;
		case "webhooks":
			_markWorkspace(scope, "webhooks", { deploy: true });
			return;
		case "geosearch":
			_markWorkspace(scope, "geosearch", { deploy: true });
			return;
		case "infrastructure":
			_markAllInfrastructure(scope, { deploy: true });
			return;
	}
}

function _isRootToolchainPath(changedPath) {
	return (
		changedPath === "package.json" ||
		changedPath === "pnpm-lock.yaml" ||
		changedPath === "pnpm-workspace.yaml" ||
		changedPath === "biome.json" ||
		changedPath === ".npmrc" ||
		changedPath === ".node-version" ||
		changedPath === ".nvmrc" ||
		changedPath.startsWith("tsconfig.") ||
		changedPath.startsWith("vitest.")
	);
}

function _markChangedPath(scope, changedPath) {
	if (_isDocumentationOrSkillPath(changedPath)) return;

	if (changedPath === ".dockerignore" || changedPath.startsWith(".github/actions/deploy-cloudflare-api-worker/")) {
		_markWorkspace(scope, "api", { deploy: true });
		return;
	}

	if (changedPath.startsWith(".github/actions/deploy-cloudflare-webhooks-worker/")) {
		_markWorkspace(scope, "webhooks", { deploy: true });
		return;
	}

	if (changedPath.startsWith(".github/actions/deploy-cloudflare-geosearch-worker/")) {
		_markWorkspace(scope, "geosearch", { deploy: true });
		return;
	}

	if (_isRootToolchainPath(changedPath)) {
		_markAllWorkspaces(scope, { deploy: true });
		return;
	}

	if (changedPath.startsWith("apps/api/")) {
		_markWorkspace(scope, "api", { deploy: !_isTestOnlyPath(changedPath) });
		return;
	}

	if (changedPath.startsWith("apps/workers/webhooks/")) {
		_markWorkspace(scope, "webhooks", { deploy: !_isTestOnlyPath(changedPath) });
		return;
	}

	if (changedPath.startsWith("apps/workers/geosearch/")) {
		_markWorkspace(scope, "geosearch", { deploy: !_isTestOnlyPath(changedPath) });
		return;
	}

	if (changedPath.startsWith("apps/workers/")) {
		_markWorkspace(scope, "webhooks", { deploy: true });
		_markWorkspace(scope, "geosearch", { deploy: true });
		return;
	}

	if (changedPath.startsWith("packages/api-internal-ingress/")) {
		if (_isTestOnlyPath(changedPath)) {
			_markWorkspace(scope, "apiInternalIngress", { deploy: false });
			return;
		}
		_markApiInternalIngress(scope, { deploy: true });
		return;
	}

	if (changedPath.startsWith("packages/microservices-auth-contracts/")) {
		if (_isTestOnlyPath(changedPath)) {
			_markWorkspace(scope, "microservicesAuthContracts", { deploy: false });
			return;
		}
		_markMicroservicesAuthContracts(scope, { deploy: true });
		return;
	}

	if (changedPath.startsWith("infrastructure/")) {
		_markInfrastructurePath(scope, changedPath, { deploy: !_isTestOnlyPath(changedPath) });
	}
}

function _buildDeploymentOrder(scope) {
	const deploymentOrder = [];
	const infrastructure = INFRASTRUCTURE_ORDER.filter((component) => scope.deploy.infrastructure[component]).map(
		(component) => `infrastructure:${component}`,
	);

	if (infrastructure.length > 0) deploymentOrder.push(infrastructure);
	if (scope.deploy.api) deploymentOrder.push(["database:migrate"], ["application:api"]);

	const workers = [];
	if (scope.deploy.webhooks) workers.push("application:webhooks");
	if (scope.deploy.geosearch) workers.push("application:geosearch");
	if (workers.length > 0) deploymentOrder.push(workers);

	return deploymentOrder;
}

function _finalizeScope(scope) {
	const validationWorkspaces = WORKSPACE_ORDER.filter((workspace) => scope.validate[workspace]).map(
		(workspace) => WORKSPACE_NAMES[workspace],
	);
	const infrastructureComponents = INFRASTRUCTURE_ORDER.filter((component) => scope.validate.infrastructure[component]);

	return {
		...scope,
		validateInfrastructure: infrastructureComponents.length > 0,
		deployInfrastructure: INFRASTRUCTURE_ORDER.some((component) => scope.deploy.infrastructure[component]),
		runMigrations: scope.deploy.api,
		validationWorkspaces,
		infrastructureComponents,
		deploymentOrder: _buildDeploymentOrder(scope),
	};
}

export function resolveAffectedWorkspaces({ changedPaths = [], manualTarget } = {}) {
	if (manualTarget !== undefined && !MANUAL_TARGETS.has(manualTarget)) {
		throw new Error(`Unsupported manual target "${manualTarget}". Expected one of: ${[...MANUAL_TARGETS].join(", ")}.`);
	}

	const normalizedChangedPaths = _normalizeChangedPaths(changedPaths);
	const scope = _createEmptyScope({
		changedPaths: normalizedChangedPaths,
		manualTarget: manualTarget,
	});

	if (manualTarget !== undefined) {
		_markManualTarget(scope, manualTarget);
		return _finalizeScope(scope);
	}

	for (const changedPath of normalizedChangedPaths) _markChangedPath(scope, changedPath);
	return _finalizeScope(scope);
}

export function formatGithubOutputs(result) {
	const outputs = {
		validate_repository: result.validate.repository,
		validate_api: result.validate.api,
		validate_webhooks: result.validate.webhooks,
		validate_geosearch: result.validate.geosearch,
		validate_api_internal_ingress: result.validate.apiInternalIngress,
		validate_microservices_auth_contracts: result.validate.microservicesAuthContracts,
		validate_infrastructure: result.validateInfrastructure,
		validate_ai_gateway: result.validate.infrastructure.aiGateway,
		validate_queues: result.validate.infrastructure.queues,
		validate_neon: result.validate.infrastructure.neon,
		validate_upstash: result.validate.infrastructure.upstash,
		deploy_api: result.deploy.api,
		deploy_webhooks: result.deploy.webhooks,
		deploy_geosearch: result.deploy.geosearch,
		deploy_infrastructure: result.deployInfrastructure,
		deploy_ai_gateway: result.deploy.infrastructure.aiGateway,
		deploy_queues: result.deploy.infrastructure.queues,
		deploy_neon: result.deploy.infrastructure.neon,
		deploy_upstash: result.deploy.infrastructure.upstash,
		run_migrations: result.runMigrations,
		validation_workspaces: result.validationWorkspaces,
		infrastructure_components: result.infrastructureComponents,
		deployment_order: result.deploymentOrder,
		result: result,
	};

	return Object.entries(outputs)
		.map(([name, value]) => `${name}=${typeof value === "boolean" ? value : JSON.stringify(value)}`)
		.join("\n");
}

function _readGitChangedPaths({ base, head }) {
	if (base === undefined || head === undefined) {
		throw new Error("--base and --head must be provided together.");
	}

	if (/^0+$/u.test(base)) {
		return execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", head], {
			encoding: "utf8",
		});
	}

	return execFileSync("git", ["diff", "--name-only", "--diff-filter=ACDMRTUXB", base, head], {
		encoding: "utf8",
	});
}

function _parseArguments(argumentsList) {
	const options = {
		changedPaths: [],
		base: undefined,
		head: undefined,
		manualTarget: undefined,
		githubOutput: false,
		githubOutputPath: undefined,
		readStdin: false,
	};

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		const supportedArgument =
			argument === "--base" ||
			argument === "--head" ||
			argument === "--path" ||
			argument === "--target" ||
			argument === "--stdin" ||
			argument === "--github-output";
		if (!supportedArgument) {
			if (argument.startsWith("--")) throw new Error(`Unsupported argument "${argument}".`);
			options.changedPaths.push(argument);
			continue;
		}

		switch (argument) {
			case "--base":
				options.base = argumentsList.at(++index);
				break;
			case "--head":
				options.head = argumentsList.at(++index);
				break;
			case "--path":
				options.changedPaths.push(argumentsList.at(++index) ?? "");
				break;
			case "--target":
				options.manualTarget = argumentsList.at(++index);
				break;
			case "--stdin":
				options.readStdin = true;
				break;
			case "--github-output": {
				options.githubOutput = true;
				const possibleOutputPath = argumentsList.at(index + 1);
				if (possibleOutputPath !== undefined && !possibleOutputPath.startsWith("--")) {
					options.githubOutputPath = possibleOutputPath;
					index += 1;
				}
				break;
			}
		}
	}

	if ((options.base === undefined) !== (options.head === undefined)) {
		throw new Error("--base and --head must be provided together.");
	}

	return options;
}

export function runAffectedWorkspacesCli({
	argumentsList = process.argv.slice(2),
	stdin = process.stdin,
	stdout = process.stdout,
	environment = process.env,
} = {}) {
	const options = _parseArguments(argumentsList);
	if (options.base !== undefined && options.changedPaths.length > 0) {
		throw new Error("Use either explicit changed paths or --base/--head, not both.");
	}

	if (options.base !== undefined) {
		options.changedPaths.push(_readGitChangedPaths({ base: options.base, head: options.head }));
	} else if (options.readStdin || (options.changedPaths.length === 0 && !stdin.isTTY)) {
		options.changedPaths.push(readFileSync(stdin.fd, "utf8"));
	}

	const result = resolveAffectedWorkspaces({
		changedPaths: options.changedPaths,
		manualTarget: options.manualTarget,
	});

	if (!options.githubOutput) {
		stdout.write(`${JSON.stringify(result)}\n`);
		return result;
	}

	const githubOutputs = `${formatGithubOutputs(result)}\n`;
	const githubOutputPath = options.githubOutputPath ?? environment.GITHUB_OUTPUT;
	if (githubOutputPath === undefined || githubOutputPath.length === 0) {
		stdout.write(githubOutputs);
		return result;
	}

	appendFileSync(githubOutputPath, githubOutputs);
	return result;
}

const executedModuleUrl = process.argv[1] === undefined ? undefined : pathToFileURL(process.argv[1]).href;
if (import.meta.url === executedModuleUrl) {
	try {
		runAffectedWorkspacesCli();
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
