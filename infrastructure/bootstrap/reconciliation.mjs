import { timingSafeEqual } from "node:crypto";

export const ENVIRONMENTS = Object.freeze(["staging", "production"]);

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const GOOGLE_ACCOUNT_PATTERN = /^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$/;
const LOWERCASE_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function _requireString(value, path, pattern) {
	if (typeof value !== "string" || value.length === 0 || (pattern && !pattern.test(value))) {
		throw new Error(`Invalid non-secret infrastructure identifier: ${path}.`);
	}
	return value;
}

function _requireExactKeys(value, expectedKeys, path) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid infrastructure configuration object: ${path}.`);
	}
	const actualKeys = Object.keys(value).sort();
	const requiredKeys = [...expectedKeys].sort();
	if (JSON.stringify(actualKeys) !== JSON.stringify(requiredKeys)) {
		throw new Error(`Unexpected keys in infrastructure configuration object: ${path}.`);
	}
}

export function validatePlatforms(platforms) {
	_requireExactKeys(platforms, ["cloudflare", "google_cloud", "infisical", "github", "neon", "upstash"], "platforms");
	_requireExactKeys(platforms.cloudflare, ["account_id", "zones"], "platforms.cloudflare");
	_requireExactKeys(platforms.cloudflare.zones, ["cataqui.com"], "platforms.cloudflare.zones");
	_requireExactKeys(platforms.cloudflare.zones["cataqui.com"], ["zone_id"], "platforms.cloudflare.zones.cataqui.com");
	_requireExactKeys(platforms.google_cloud, ["organization_id", "billing_account_id"], "platforms.google_cloud");
	_requireExactKeys(platforms.infisical, ["organization_id"], "platforms.infisical");
	_requireExactKeys(platforms.github, ["repository"], "platforms.github");
	_requireExactKeys(platforms.neon, ["organization_id"], "platforms.neon");
	_requireExactKeys(platforms.upstash, ["account_email"], "platforms.upstash");

	_requireString(platforms?.cloudflare?.account_id, "cloudflare.account_id", /^[a-f0-9]{32}$/);
	_requireString(
		platforms?.cloudflare?.zones?.["cataqui.com"]?.zone_id,
		"cloudflare.zones.cataqui.com.zone_id",
		/^[a-f0-9]{32}$/,
	);
	_requireString(platforms?.google_cloud?.organization_id, "google_cloud.organization_id", /^\d+$/);
	_requireString(
		platforms?.google_cloud?.billing_account_id,
		"google_cloud.billing_account_id",
		GOOGLE_ACCOUNT_PATTERN,
	);
	_requireString(
		platforms?.infisical?.organization_id,
		"infisical.organization_id",
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	);
	_requireString(platforms?.github?.repository, "github.repository", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
	_requireString(platforms?.neon?.organization_id, "neon.organization_id", /^org-[a-z0-9-]+$/);
	_requireString(platforms?.upstash?.account_email, "upstash.account_email", EMAIL_PATTERN);

	return platforms;
}

export function validateManifest(manifest) {
	_requireExactKeys(manifest, ["cloudflare", "google_cloud", "infisical", "github", "neon", "upstash"], "manifest");
	_requireExactKeys(manifest.cloudflare, ["ai_gateways", "queues", "r2"], "manifest.cloudflare");
	_requireExactKeys(
		manifest.cloudflare.ai_gateways,
		["derive_job_data_staging", "derive_job_data_production"],
		"manifest.cloudflare.ai_gateways",
	);
	_requireExactKeys(
		manifest.cloudflare.queues,
		["derive_job_data_staging", "derive_job_data_production"],
		"manifest.cloudflare.queues",
	);
	for (const environment of ENVIRONMENTS) {
		_requireExactKeys(
			manifest.cloudflare.queues[`derive_job_data_${environment}`],
			["name", "dead_letter_name"],
			`manifest.cloudflare.queues.derive_job_data_${environment}`,
		);
	}
	_requireExactKeys(manifest.cloudflare.r2, ["buckets"], "manifest.cloudflare.r2");
	_requireExactKeys(manifest.cloudflare.r2.buckets, ["opentofu_state"], "manifest.cloudflare.r2.buckets");
	_requireExactKeys(manifest.google_cloud, ["projects", "github_auth"], "manifest.google_cloud");
	_requireExactKeys(
		manifest.google_cloud.projects,
		["cataqui_staging", "cataqui_production"],
		"manifest.google_cloud.projects",
	);
	for (const environment of ENVIRONMENTS) {
		_requireExactKeys(
			manifest.google_cloud.projects[`cataqui_${environment}`],
			["name", "id"],
			`manifest.google_cloud.projects.cataqui_${environment}`,
		);
	}
	_requireExactKeys(
		manifest.google_cloud.github_auth,
		["workload_identity_pool_id", "workload_identity_provider_id", "service_accounts"],
		"manifest.google_cloud.github_auth",
	);
	_requireExactKeys(
		manifest.google_cloud.github_auth.service_accounts,
		["cataqui_backend_staging", "cataqui_backend_production"],
		"manifest.google_cloud.github_auth.service_accounts",
	);
	_requireExactKeys(manifest.infisical, ["project", "opentofu_identities"], "manifest.infisical");
	_requireExactKeys(manifest.infisical.project, ["name", "slug"], "manifest.infisical.project");
	_requireExactKeys(
		manifest.infisical.opentofu_identities,
		["cataqui_backend_staging", "cataqui_backend_production"],
		"manifest.infisical.opentofu_identities",
	);
	_requireExactKeys(manifest.github, ["environments"], "manifest.github");
	_requireExactKeys(manifest.github.environments, ENVIRONMENTS, "manifest.github.environments");
	_requireExactKeys(manifest.neon, ["api_keys", "projects", "databases"], "manifest.neon");
	_requireExactKeys(manifest.neon.api_keys, ["account_bootstrap", "project_access"], "manifest.neon.api_keys");
	_requireExactKeys(manifest.neon.api_keys.account_bootstrap, ["name"], "manifest.neon.api_keys.account_bootstrap");
	_requireExactKeys(
		manifest.neon.api_keys.project_access,
		["cataqui_staging", "cataqui_production"],
		"manifest.neon.api_keys.project_access",
	);
	_requireExactKeys(manifest.neon.projects, ["cataqui_staging", "cataqui_production"], "manifest.neon.projects");
	for (const environment of ENVIRONMENTS) {
		_requireExactKeys(
			manifest.neon.api_keys.project_access[`cataqui_${environment}`],
			["name"],
			`manifest.neon.api_keys.project_access.cataqui_${environment}`,
		);
		_requireExactKeys(
			manifest.neon.projects[`cataqui_${environment}`],
			["name"],
			`manifest.neon.projects.cataqui_${environment}`,
		);
	}
	_requireExactKeys(manifest.neon.databases, ["cataqui"], "manifest.neon.databases");
	_requireExactKeys(
		manifest.neon.databases.cataqui,
		["name", "owner_role", "runtime_role"],
		"manifest.neon.databases.cataqui",
	);
	_requireExactKeys(manifest.upstash, ["redis"], "manifest.upstash");
	_requireExactKeys(manifest.upstash.redis, ["databases"], "manifest.upstash.redis");
	_requireExactKeys(
		manifest.upstash.redis.databases,
		["cataqui_api_staging", "cataqui_api_production"],
		"manifest.upstash.redis.databases",
	);
	for (const environment of ENVIRONMENTS) {
		_requireExactKeys(
			manifest.upstash.redis.databases[`cataqui_api_${environment}`],
			["name"],
			`manifest.upstash.redis.databases.cataqui_api_${environment}`,
		);
	}

	_requireString(
		manifest.cloudflare.r2.buckets.opentofu_state,
		"cloudflare.r2.buckets.opentofu_state",
		LOWERCASE_NAME_PATTERN,
	);
	_requireString(manifest.infisical.project.name, "infisical.project.name");
	_requireString(manifest.infisical.project.slug, "infisical.project.slug", LOWERCASE_NAME_PATTERN);
	_requireString(
		manifest.google_cloud.github_auth.workload_identity_pool_id,
		"google_cloud.github_auth.workload_identity_pool_id",
		LOWERCASE_NAME_PATTERN,
	);
	_requireString(
		manifest.google_cloud.github_auth.workload_identity_provider_id,
		"google_cloud.github_auth.workload_identity_provider_id",
		LOWERCASE_NAME_PATTERN,
	);
	_requireString(manifest.neon.databases.cataqui.name, "neon.databases.cataqui.name", /^[a-z][a-z0-9_]*$/);
	_requireString(
		manifest.neon.api_keys.account_bootstrap.name,
		"neon.api_keys.account_bootstrap.name",
		LOWERCASE_NAME_PATTERN,
	);
	_requireString(manifest.neon.databases.cataqui.owner_role, "neon.databases.cataqui.owner_role", /^[a-z][a-z0-9_]*$/);
	_requireString(
		manifest.neon.databases.cataqui.runtime_role,
		"neon.databases.cataqui.runtime_role",
		/^[a-z][a-z0-9_]*$/,
	);

	for (const environment of ENVIRONMENTS) {
		_requireString(
			manifest.neon.api_keys.project_access[`cataqui_${environment}`].name,
			`neon.api_keys.project_access.cataqui_${environment}.name`,
			LOWERCASE_NAME_PATTERN,
		);
		_requireString(
			manifest.cloudflare.ai_gateways[`derive_job_data_${environment}`],
			`cloudflare.ai_gateways.derive_job_data_${environment}`,
			LOWERCASE_NAME_PATTERN,
		);
		_requireString(
			manifest.cloudflare.queues[`derive_job_data_${environment}`].name,
			`cloudflare.queues.derive_job_data_${environment}.name`,
			LOWERCASE_NAME_PATTERN,
		);
		_requireString(
			manifest.cloudflare.queues[`derive_job_data_${environment}`].dead_letter_name,
			`cloudflare.queues.derive_job_data_${environment}.dead_letter_name`,
			LOWERCASE_NAME_PATTERN,
		);
		_requireString(
			manifest.neon.projects[`cataqui_${environment}`].name,
			`neon.projects.cataqui_${environment}.name`,
			LOWERCASE_NAME_PATTERN,
		);
		_requireString(
			manifest.upstash.redis.databases[`cataqui_api_${environment}`].name,
			`upstash.redis.databases.cataqui_api_${environment}.name`,
			LOWERCASE_NAME_PATTERN,
		);
		const projectKey = `cataqui_${environment}`;
		_requireString(
			manifest.google_cloud.projects[projectKey].name,
			`google_cloud.projects.${projectKey}.name`,
			LOWERCASE_NAME_PATTERN,
		);
		_requireString(
			manifest.google_cloud.projects[projectKey].id,
			`google_cloud.projects.${projectKey}.id`,
			PROJECT_ID_PATTERN,
		);
		_requireString(
			manifest.infisical.opentofu_identities[`cataqui_backend_${environment}`],
			`infisical.opentofu_identities.cataqui_backend_${environment}`,
		);
		_requireString(
			manifest.google_cloud.github_auth.service_accounts[`cataqui_backend_${environment}`],
			`google_cloud.github_auth.service_accounts.cataqui_backend_${environment}`,
			/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
		);
		const branches = manifest.github.environments[environment]?.branches;
		if (
			!Array.isArray(branches) ||
			branches.length === 0 ||
			branches.some((branch) => typeof branch !== "string" || !branch)
		) {
			throw new Error(`Invalid branch policy: github.environments.${environment}.branches.`);
		}
	}

	return manifest;
}

export function resolveUniqueNamedResource(resources, expectedName, ownerPredicate = () => true) {
	const matches = resources.filter((resource) => resource.name === expectedName);
	if (matches.length > 1) throw new Error(`Duplicate bootstrap ownership for ${expectedName}.`);
	if (matches.length === 0) return undefined;
	if (!ownerPredicate(matches[0])) throw new Error(`Foreign resource conflicts with ${expectedName}.`);
	return matches[0];
}

export function constantTimeEqual(left, right) {
	if (typeof left !== "string" || typeof right !== "string") return false;
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function redactSecrets(value, secrets) {
	let redacted = String(value);
	for (const secret of secrets) {
		if (typeof secret === "string" && secret.length >= 4) redacted = redacted.replaceAll(secret, "[REDACTED]");
	}
	return redacted;
}
