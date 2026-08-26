import { runAsync } from "./bootstrap-runtime.mjs";

async function _api(repository, path, { method = "GET", fields = [], allowFailure = false } = {}) {
	const args = ["api", `repos/${repository}${path}`, "--method", method];
	for (const [key, value] of fields) args.push("-F", `${key}=${value}`);
	return runAsync("gh", args, { allowFailure });
}

export async function reconcileGithubEnvironment({ platforms, manifest, environment, identityId, googleAuth }) {
	const repository = platforms.github.repository;
	const environmentResult = await _api(repository, `/environments/${environment}`, { allowFailure: true });
	if (environmentResult.status !== 0 && !/HTTP 404|Not Found/i.test(environmentResult.stderr)) {
		throw new Error(`Unable to inspect GitHub environment ${environment}: ${environmentResult.stderr.trim()}`);
	}
	const current = environmentResult.status === 0 ? JSON.parse(environmentResult.stdout) : {};
	const fields = [
		["deployment_branch_policy[protected_branches]", "false"],
		["deployment_branch_policy[custom_branch_policies]", "true"],
		["wait_timer", String(current.protection_rules?.find((rule) => rule.type === "wait_timer")?.wait_timer ?? 0)],
		["prevent_self_review", String(current.prevent_self_review ?? false)],
	];
	const reviewers = current.protection_rules?.find((rule) => rule.type === "required_reviewers")?.reviewers ?? [];
	for (const [index, reviewer] of reviewers.entries()) {
		fields.push(
			[`reviewers[${index}][type]`, reviewer.type],
			[`reviewers[${index}][id]`, String(reviewer.reviewer.id)],
		);
	}
	if (
		environmentResult.status !== 0 ||
		current.deployment_branch_policy?.protected_branches !== false ||
		current.deployment_branch_policy?.custom_branch_policies !== true
	) {
		await _api(repository, `/environments/${environment}`, { method: "PUT", fields });
	}

	const policies =
		JSON.parse((await _api(repository, `/environments/${environment}/deployment-branch-policies`)).stdout)
			.branch_policies ?? [];
	const expectedBranches = new Set(manifest.github.environments[environment].branches);
	for (const policy of policies) {
		if (!expectedBranches.has(policy.name)) {
			await _api(repository, `/environments/${environment}/deployment-branch-policies/${policy.id}`, {
				method: "DELETE",
			});
		}
	}
	for (const branch of expectedBranches) {
		if (!policies.some((policy) => policy.name === branch)) {
			await _api(repository, `/environments/${environment}/deployment-branch-policies`, {
				method: "POST",
				fields: [
					["name", branch],
					["type", "branch"],
				],
			});
		}
	}

	const variables = {
		INFISICAL_OPENTOFU_IDENTITY_ID: identityId,
		GOOGLE_WORKLOAD_IDENTITY_PROVIDER: googleAuth.provider,
	};
	const currentVariables = JSON.parse(
		(await _api(repository, `/environments/${environment}/variables?per_page=100`)).stdout,
	).variables;
	for (const [name, value] of Object.entries(variables)) {
		if (currentVariables.find((variable) => variable.name === name)?.value !== value) {
			await runAsync("gh", ["variable", "set", name, "--repo", repository, "--env", environment, "--body", value]);
		}
	}

	const verifiedEnvironment = JSON.parse((await _api(repository, `/environments/${environment}`)).stdout);
	if (
		verifiedEnvironment.deployment_branch_policy?.protected_branches !== false ||
		verifiedEnvironment.deployment_branch_policy?.custom_branch_policies !== true
	) {
		throw new Error(`GitHub environment policy verification failed for ${environment}.`);
	}
	const verifiedPolicies = JSON.parse(
		(await _api(repository, `/environments/${environment}/deployment-branch-policies`)).stdout,
	).branch_policies.map((policy) => policy.name);
	if (JSON.stringify(verifiedPolicies.sort()) !== JSON.stringify([...expectedBranches].sort())) {
		throw new Error(`GitHub branch policy verification failed for ${environment}.`);
	}
	const verifiedVariables = JSON.parse(
		(await _api(repository, `/environments/${environment}/variables?per_page=100`)).stdout,
	).variables;
	for (const [name, value] of Object.entries(variables)) {
		if (verifiedVariables.find((variable) => variable.name === name)?.value !== value) {
			throw new Error(`GitHub variable verification failed for ${environment}: ${name}.`);
		}
	}
}
