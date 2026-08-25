export function decideGoogleProject({
	expectedProjectId,
	expectedOrganizationId,
	remoteStateProjectIds,
	discoveredProject,
}) {
	const managedIds = [...new Set(remoteStateProjectIds)];
	if (managedIds.some((projectId) => projectId !== expectedProjectId)) {
		throw new Error(`Google project state contains an unexpected protected project instead of ${expectedProjectId}.`);
	}
	if (!discoveredProject) {
		if (managedIds.includes(expectedProjectId)) {
			throw new Error(`Google project state manages ${expectedProjectId}, but the project no longer exists.`);
		}
		return "create";
	}
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
	if (managedIds.includes(expectedProjectId)) return "reconcile";
	return "import";
}
