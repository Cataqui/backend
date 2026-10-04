import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function verifyPagesDeployment({ accountId, projectName, branch, token, request = fetch }) {
	const response = await request(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`,
		{ headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) },
	);
	if (!response.ok) throw new Error(`Pages deployment inspection failed with HTTP ${response.status}.`);
	const payload = await response.json();
	const project = payload.result;
	// A disabled preview can be the project's latest deployment after the other branch is pushed.
	// Inspect production history so unrelated skipped previews cannot block domain activation.
	const historyResponse = await request(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments?env=production&per_page=1`,
		{ headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) },
	);
	if (!historyResponse.ok) throw new Error(`Pages build history failed with HTTP ${historyResponse.status}.`);
	const history = await historyResponse.json();
	const deployment = history.success === true && Array.isArray(history.result) ? history.result[0] : undefined;
	if (
		payload.success !== true ||
		project?.name !== projectName ||
		project.production_branch !== branch ||
		deployment?.environment !== "production" ||
		typeof deployment.id !== "string" ||
		deployment.id.length === 0 ||
		deployment.deployment_trigger?.metadata?.branch !== branch ||
		deployment.latest_stage?.name !== "deploy" ||
		deployment.latest_stage.status !== "success" ||
		project.canonical_deployment?.id !== deployment.id ||
		typeof project.subdomain !== "string" ||
		!/^[a-z0-9-]+\.pages\.dev$/.test(project.subdomain)
	) {
		throw new Error(`Verify the latest successful ${branch} build of ${projectName} before domain activation.`);
	}
	const page = await request(`https://${project.subdomain}/`, {
		redirect: "manual",
		signal: AbortSignal.timeout(30000),
	});
	if (page.status !== 200) throw new Error(`Pages landing probe failed with HTTP ${page.status}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const environment = process.env.INPUT_ENVIRONMENT;
		if (!["staging", "production"].includes(environment)) throw new Error("Unsupported Pages environment.");
		const plan = JSON.parse(execFileSync("tofu", ["show", "-json", process.argv[2]], { encoding: "utf8" }));
		if (!Array.isArray(plan.resource_changes)) throw new Error("Pages plan resource changes are missing.");
		const needsDomainVerification = plan.resource_changes.some(
			(resource) =>
				resource.type === "cloudflare_pages_domain" &&
				resource.change.after !== null &&
				resource.change.actions.some((action) => action === "create" || action === "update"),
		);
		if (needsDomainVerification) {
			const platforms = JSON.parse(readFileSync("../../../platforms.json", "utf8"));
			const manifest = JSON.parse(readFileSync("../../../manifest.json", "utf8"));
			const token = process.env.CLOUDFLARE_API_TOKEN;
			if (!token) throw new Error("Pages infrastructure credential is required.");
			await verifyPagesDeployment({
				accountId: platforms.cloudflare.account_id,
				projectName: manifest.cloudflare.pages[`landing_${environment}`].name,
				branch: environment === "staging" ? "staging" : "main",
				token: token,
			});
		}
	} catch {
		console.error(
			"Pages build verification failed. Confirm the latest matching branch build succeeded and its pages.dev URL returns HTTP 200 before activating domains.",
		);
		process.exitCode = 1;
	}
}
