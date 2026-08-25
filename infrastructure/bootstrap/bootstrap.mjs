#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
	ensurePrivateR2Bucket,
	probeR2Credentials,
	reconcileR2Credentials,
	resolveCloudflareBootstrapToken,
} from "./cloudflare-bootstrap.mjs";
import { acquireLock, knownSecrets, log, manifestPath, platformsPath, requireTool, run } from "./bootstrap-runtime.mjs";
import { reconcileGithubEnvironment } from "./github-bootstrap.mjs";
import { applyGoogleGithubAuth, getBackendCredentials, reconcileGoogleProjects } from "./google-cloud-bootstrap.mjs";
import {
	ensureBootstrapFolders,
	reconcileInfisicalIdentity,
	reconcileInfisicalProject,
} from "./infisical-bootstrap.mjs";
import { reconcileNeonApiKeys, verifyNeonCliAuthentication } from "./neon-bootstrap.mjs";
import { ENVIRONMENTS, redactSecrets, validateManifest, validatePlatforms } from "./reconciliation.mjs";
import { reconcileUpstashApiKey } from "./upstash-bootstrap.mjs";

function _validateLocalAuthentication(platforms) {
	for (const tool of ["tofu", "wrangler", "infisical", "gcloud", "gh", "neon"]) requireTool(tool);
	const wranglerIdentity = run("wrangler", ["whoami"]);
	if (!wranglerIdentity.stdout.includes(platforms.cloudflare.account_id)) {
		throw new Error(`Wrangler is not authenticated to Cloudflare account ${platforms.cloudflare.account_id}.`);
	}
	const repository = JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner"]).stdout).nameWithOwner;
	if (repository !== platforms.github.repository) {
		throw new Error(`Authenticated repository is ${repository}, expected ${platforms.github.repository}.`);
	}
	run("gcloud", ["auth", "application-default", "print-access-token"]);
	run("infisical", ["login", "status", "--json"]);
	verifyNeonCliAuthentication(platforms);
}

function _getInfisicalToken() {
	const token = run("infisical", ["user", "get", "token", "--plain", "--silent"]).stdout.trim();
	if (!token) throw new Error("Infisical CLI did not return an authenticated session.");
	knownSecrets.add(token);
	return token;
}

async function _main() {
	if (process.argv.length !== 2) throw new Error("infrastructure:bootstrap accepts no arguments.");
	const releaseLock = acquireLock();
	try {
		const platforms = validatePlatforms(JSON.parse(readFileSync(platformsPath, "utf8")));
		const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
		_validateLocalAuthentication(platforms);
		const infisicalToken = _getInfisicalToken();
		const infisicalProjectId = await reconcileInfisicalProject({ platforms, manifest }, infisicalToken);

		ensurePrivateR2Bucket(manifest);
		await ensureBootstrapFolders(infisicalProjectId, infisicalToken);
		const cloudflareToken = await resolveCloudflareBootstrapToken(infisicalProjectId, infisicalToken);
		await reconcileR2Credentials({ platforms, manifest, infisicalProjectId, infisicalToken, cloudflareToken });
		await reconcileUpstashApiKey(platforms, infisicalProjectId, infisicalToken);
		await reconcileNeonApiKeys(platforms, infisicalProjectId, infisicalToken);
		await reconcileGoogleProjects({ platforms, manifest }, infisicalProjectId, infisicalToken);
		const googleAuth = await applyGoogleGithubAuth(infisicalProjectId, infisicalToken);
		for (const environment of ENVIRONMENTS) {
			const identityId = await reconcileInfisicalIdentity({
				platforms,
				manifest,
				projectId: infisicalProjectId,
				infisicalToken,
				environment,
			});
			reconcileGithubEnvironment({ platforms, manifest, environment, identityId, googleAuth });
		}
		for (const environment of ENVIRONMENTS) {
			const credentials = await getBackendCredentials(infisicalProjectId, infisicalToken, environment);
			if (!(await probeR2Credentials({ platforms, manifest, ...credentials }))) {
				throw new Error(`Final ${environment} R2 verification failed.`);
			}
		}
		log("Infrastructure bootstrap is healthy.");
	} finally {
		releaseLock();
	}
}

_main().catch((error) => {
	process.stderr.write(`${redactSecrets(error instanceof Error ? error.message : error, knownSecrets)}\n`);
	process.exitCode = 1;
});
