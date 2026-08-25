#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
	ensurePrivateR2Bucket,
	probeR2Credentials,
	reconcileR2Credentials,
	resolveCloudflareBootstrapToken,
} from "./cloudflare-bootstrap.mjs";
import { acquireLock, knownSecrets, log, platformsPath, requireTool, run } from "./bootstrap-runtime.mjs";
import { reconcileGithubEnvironment } from "./github-bootstrap.mjs";
import { applyGoogleGithubAuth, getBackendCredentials, reconcileGoogleProjects } from "./google-cloud-bootstrap.mjs";
import { ensureBootstrapFolders, reconcileInfisicalIdentity } from "./infisical-bootstrap.mjs";
import { ENVIRONMENTS, redactSecrets, validatePlatforms } from "./reconciliation.mjs";

function _validateLocalAuthentication(platforms) {
	for (const tool of ["tofu", "wrangler", "infisical", "gcloud", "gh"]) requireTool(tool);
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
		_validateLocalAuthentication(platforms);
		const infisicalToken = _getInfisicalToken();

		ensurePrivateR2Bucket(platforms);
		await ensureBootstrapFolders(platforms, infisicalToken);
		const cloudflareToken = await resolveCloudflareBootstrapToken(platforms, infisicalToken);
		await reconcileR2Credentials({ platforms, infisicalToken, cloudflareToken });
		await reconcileGoogleProjects(platforms, infisicalToken);
		const googleAuth = await applyGoogleGithubAuth(platforms, infisicalToken);
		for (const environment of ENVIRONMENTS) {
			const identityId = await reconcileInfisicalIdentity({ platforms, infisicalToken, environment });
			reconcileGithubEnvironment({ platforms, environment, identityId, googleAuth });
		}
		for (const environment of ENVIRONMENTS) {
			const credentials = await getBackendCredentials(platforms, infisicalToken, environment);
			if (!(await probeR2Credentials({ platforms, ...credentials }))) {
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
