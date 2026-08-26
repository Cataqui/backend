export function decideGoogleProject({
	expectedProjectId,
	expectedOrganizationId,
	remoteStateProjectIds,
	taintedProjectIds = [],
	projectDiscovery,
}) {
	const managedIds = [...new Set(remoteStateProjectIds)];
	const taintedIds = [...new Set(taintedProjectIds)];
	if (managedIds.some((projectId) => projectId !== expectedProjectId)) {
		throw new Error(`Google project state contains an unexpected protected project instead of ${expectedProjectId}.`);
	}
	if (taintedIds.some((projectId) => !managedIds.includes(projectId))) {
		throw new Error("Google project state contains an invalid tainted project instance.");
	}
	if (projectDiscovery.kind === "missing") {
		if (managedIds.includes(expectedProjectId)) {
			throw new Error(`Google project state manages ${expectedProjectId}, but the project no longer exists.`);
		}
		return "create";
	}
	if (projectDiscovery.kind === "hidden-or-missing") {
		if (managedIds.includes(expectedProjectId)) {
			throw new Error(`Google project state manages ${expectedProjectId}, but its ownership cannot be verified.`);
		}
		return "claim";
	}
	const discoveredProject = projectDiscovery.project;
	const parent = discoveredProject.parent;
	const belongsToOrganization =
		typeof parent === "string"
			? parent === `organizations/${expectedOrganizationId}`
			: String(parent?.id) === String(expectedOrganizationId) && parent?.type === "organization";
	if (!belongsToOrganization) {
		throw new Error(`Google project ID ${expectedProjectId} belongs outside the declared organization.`);
	}
	if (discoveredProject.lifecycleState && discoveredProject.lifecycleState !== "ACTIVE") {
		throw new Error(`Google project ID ${expectedProjectId} is not active.`);
	}
	if (managedIds.includes(expectedProjectId)) {
		return taintedIds.includes(expectedProjectId) ? "recover" : "reconcile";
	}
	return "import";
}

export function classifyGoogleProjectDiscovery({ projectId, status, stdout, stderr }) {
	if (status === 0) {
		try {
			return { kind: "found", project: JSON.parse(stdout) };
		} catch {
			throw new Error(`Google Cloud returned invalid project metadata for ${projectId}.`);
		}
	}
	const output = `${stdout}\n${stderr}`;
	if (/NOT_FOUND|not found|does not exist/i.test(output) && !/or it may not exist/i.test(output)) {
		return { kind: "missing" };
	}
	if (
		/does not have permission to access projects instance/i.test(output) &&
		/or it may not exist/i.test(output) &&
		/The caller does not have permission/i.test(output)
	) {
		return { kind: "hidden-or-missing" };
	}
	throw new Error(`Unable to determine ownership of Google project ${projectId}: ${stderr.trim()}`);
}
