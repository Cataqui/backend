import { timingSafeEqual } from "node:crypto";

export const ENVIRONMENTS = Object.freeze(["staging", "production"]);

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const GOOGLE_ACCOUNT_PATTERN = /^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$/;
const LOWERCASE_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

function _requireString(value, path, pattern) {
	if (typeof value !== "string" || value.length === 0 || (pattern && !pattern.test(value))) {
		throw new Error(`Invalid non-secret platform identifier: ${path}.`);
	}
	return value;
}

function _requireExactKeys(value, expectedKeys, path) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid platform object: ${path}.`);
	}
	const actualKeys = Object.keys(value).sort();
	const requiredKeys = [...expectedKeys].sort();
	if (JSON.stringify(actualKeys) !== JSON.stringify(requiredKeys)) {
		throw new Error(`Unexpected keys in platform object: ${path}.`);
	}
}

export function validatePlatforms(platforms) {
	_requireString(platforms?.cloudflare?.account_id, "cloudflare.account_id", /^[a-f0-9]{32}$/);
	_requireString(platforms?.google_cloud?.organization_id, "google_cloud.organization_id", /^\d+$/);
	_requireString(
		platforms?.google_cloud?.billing_account_id,
		"google_cloud.billing_account_id",
		GOOGLE_ACCOUNT_PATTERN,
	);
	_requireString(platforms?.infisical?.project_id, "infisical.project_id", /^[a-f0-9-]{36}$/);
	_requireString(platforms?.infisical?.project_slug, "infisical.project_slug", LOWERCASE_NAME_PATTERN);
	_requireString(
		platforms?.cloudflare?.r2?.buckets?.opentofu_state,
		"cloudflare.r2.buckets.opentofu_state",
		LOWERCASE_NAME_PATTERN,
	);
	_requireString(platforms?.github?.repository, "github.repository", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);

	_requireExactKeys(platforms.cloudflare.r2, ["buckets"], "cloudflare.r2");
	_requireExactKeys(platforms.cloudflare.r2.buckets, ["opentofu_state"], "cloudflare.r2.buckets");
	_requireExactKeys(platforms.infisical, ["project_id", "project_slug", "opentofu_identities"], "infisical");
	_requireExactKeys(
		platforms.google_cloud.projects,
		["cataqui_staging", "cataqui_production"],
		"google_cloud.projects",
	);
	_requireExactKeys(platforms.github.environments, ENVIRONMENTS, "github.environments");
	_requireExactKeys(
		platforms.infisical.opentofu_identities,
		["cataqui_backend_staging", "cataqui_backend_production"],
		"infisical.opentofu_identities",
	);
	_requireExactKeys(
		platforms.google_cloud.github_auth.service_accounts,
		["cataqui_backend_staging", "cataqui_backend_production"],
		"google_cloud.github_auth.service_accounts",
	);

	for (const environment of ENVIRONMENTS) {
		const projectKey = `cataqui_${environment}`;
		_requireString(
			platforms.google_cloud.projects[projectKey],
			`google_cloud.projects.${projectKey}`,
			PROJECT_ID_PATTERN,
		);
		_requireString(
			platforms.infisical.opentofu_identities[`cataqui_backend_${environment}`],
			`infisical.opentofu_identities.cataqui_backend_${environment}`,
		);
		_requireString(
			platforms.google_cloud.github_auth.service_accounts[`cataqui_backend_${environment}`],
			`google_cloud.github_auth.service_accounts.cataqui_backend_${environment}`,
			/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
		);
		const branches = platforms.github.environments[environment]?.branches;
		if (
			!Array.isArray(branches) ||
			branches.length === 0 ||
			branches.some((branch) => typeof branch !== "string" || !branch)
		) {
			throw new Error(`Invalid branch policy: github.environments.${environment}.branches.`);
		}
	}

	return platforms;
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
