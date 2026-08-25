import { ENVIRONMENTS } from "./reconciliation.mjs";

export const INFISICAL_PROJECT_TYPE = "secret-manager";

export function decideInfisicalProject({ projects, expectedOrganizationId, expectedName, expectedSlug }) {
	const matches = projects.filter((project) => project.slug === expectedSlug);
	if (matches.length > 1) throw new Error(`Duplicate Infisical projects use slug ${expectedSlug}.`);
	if (matches.length === 0) return { action: "create" };

	const project = matches[0];
	if (project.orgId !== expectedOrganizationId) {
		throw new Error(`Infisical project ${expectedSlug} belongs to a foreign organization.`);
	}
	if (project.type !== INFISICAL_PROJECT_TYPE) {
		throw new Error(`Infisical project ${expectedSlug} is not a secret-manager project.`);
	}
	return {
		action: project.name === expectedName && project.hasDeleteProtection ? "reuse" : "reconcile",
		project,
	};
}

export function assertInfisicalOrganizationScope(projects, expectedOrganizationId) {
	const organizationIds = new Set(projects.map((project) => project.orgId));
	if (organizationIds.size !== 1 || !organizationIds.has(expectedOrganizationId)) {
		throw new Error(`Infisical session is not scoped exclusively to organization ${expectedOrganizationId}.`);
	}
}

export function getMissingInfisicalEnvironments(project) {
	const environments = Array.isArray(project.environments) ? project.environments : [];
	for (const environment of ENVIRONMENTS) {
		const matches = environments.filter((candidate) => candidate.slug === environment);
		if (matches.length > 1) throw new Error(`Duplicate Infisical environment slug ${environment}.`);
	}
	return ENVIRONMENTS.filter((environment) => !environments.some((candidate) => candidate.slug === environment));
}

export function assertInfisicalProjectContract({ project, expectedOrganizationId, expectedName, expectedSlug }) {
	if (
		project?.orgId !== expectedOrganizationId ||
		project?.name !== expectedName ||
		project?.slug !== expectedSlug ||
		project?.type !== INFISICAL_PROJECT_TYPE ||
		project?.hasDeleteProtection !== true ||
		getMissingInfisicalEnvironments(project).length !== 0
	) {
		throw new Error(`Infisical project ${expectedSlug} failed final verification.`);
	}
	return project;
}

export async function reconcileInfisicalProjectState({
	expectedOrganizationId,
	expectedName,
	expectedSlug,
	listProjects,
	createProject,
	updateProject,
	createEnvironment,
}) {
	let projects = await listProjects();
	assertInfisicalOrganizationScope(projects, expectedOrganizationId);
	const decision = decideInfisicalProject({ projects, expectedOrganizationId, expectedName, expectedSlug });

	let project = decision.project;
	if (decision.action === "create") {
		project = await createProject();
		if (project?.orgId !== expectedOrganizationId) {
			throw new Error(`Created Infisical project ${expectedSlug} in an unexpected organization.`);
		}
	} else if (decision.action === "reconcile") {
		project = await updateProject(project);
	}
	if (decision.action !== "reuse") {
		projects = await listProjects();
		const refreshed = decideInfisicalProject({ projects, expectedOrganizationId, expectedName, expectedSlug });
		if (!refreshed.project) throw new Error(`Infisical project ${expectedSlug} disappeared during reconciliation.`);
		project = refreshed.project;
	}

	for (const environment of getMissingInfisicalEnvironments(project)) {
		await createEnvironment({ projectId: project.id, environment });
	}

	projects = await listProjects();
	const verified = decideInfisicalProject({ projects, expectedOrganizationId, expectedName, expectedSlug });
	if (!verified.project) throw new Error(`Infisical project ${expectedSlug} disappeared during reconciliation.`);
	return assertInfisicalProjectContract({
		project: verified.project,
		expectedOrganizationId,
		expectedName,
		expectedSlug,
	}).id;
}
