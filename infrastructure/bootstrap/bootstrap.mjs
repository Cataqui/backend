#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
	ensurePrivateR2Bucket,
	probeR2Credentials,
	reconcileR2Credentials,
	resolveCloudflareBootstrapToken,
} from "./cloudflare-bootstrap.mjs";
import {
	acquireLock,
	failBootstrapUi,
	finishBootstrapUi,
	knownSecrets,
	manifestPath,
	platformsPath,
	requireToolAsync,
	runAsync,
	runBootstrapPhase,
	startBootstrapUi,
} from "./bootstrap-runtime.mjs";
import { getGithubOidcSubjectPrefix, reconcileGithubEnvironment } from "./github-bootstrap.mjs";
import { applyGoogleGithubAuth, getBackendCredentials, reconcileGoogleProjects } from "./google-cloud-bootstrap.mjs";
import {
	applyGeneratedFolders,
	ensureBootstrapFolders,
	ensureManualSecrets,
	reconcileInfisicalIdentity,
	reconcileInfisicalProject,
} from "./infisical-bootstrap.mjs";
import { reconcileNeonAccountApiKey, verifyNeonCliAuthenticationAsync } from "./neon-bootstrap.mjs";
import { reconcileMetaAppSecret } from "./meta-bootstrap.mjs";
import { ENVIRONMENTS, redactSecrets, validateManifest, validatePlatforms } from "./reconciliation.mjs";
import { reconcileUpstashApiKey } from "./upstash-bootstrap.mjs";

async function _validateLocalAuthentication(platforms) {
	await Promise.all(["tofu", "wrangler", "infisical", "gcloud", "gh", "neon"].map((tool) => requireToolAsync(tool)));
	const wranglerIdentity = await runAsync("wrangler", ["whoami"]);
	if (!wranglerIdentity.stdout.includes(platforms.cloudflare.account_id)) {
		throw new Error(`Wrangler is not authenticated to Cloudflare account ${platforms.cloudflare.account_id}.`);
	}
	const repository = JSON.parse(
		(await runAsync("gh", ["repo", "view", "--json", "nameWithOwner"])).stdout,
	).nameWithOwner;
	if (repository !== platforms.github.repository) {
		throw new Error(`Authenticated repository is ${repository}, expected ${platforms.github.repository}.`);
	}
	await runAsync("gcloud", ["auth", "application-default", "print-access-token"]);
	await runAsync("infisical", ["login", "status", "--json"]);
	await verifyNeonCliAuthenticationAsync();
}

async function _getInfisicalToken() {
	const token = (await runAsync("infisical", ["user", "get", "token", "--plain", "--silent"])).stdout.trim();
	if (!token) throw new Error("Infisical CLI did not return an authenticated session.");
	knownSecrets.add(token);
	return token;
}

function _phase(pending, complete, operation) {
	return runBootstrapPhase({ pending, complete }, operation);
}

async function _main() {
	if (process.argv.length !== 2) throw new Error("infrastructure:bootstrap accepts no arguments.");
	const releaseLock = acquireLock();
	try {
		startBootstrapUi();
		const { platforms, manifest, githubOidcSubjectPrefix } = await _phase(
			"Checking configuration and local authentication",
			"Local prerequisites verified",
			async () => {
				const platforms = validatePlatforms(JSON.parse(readFileSync(platformsPath, "utf8")));
				const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
				await _validateLocalAuthentication(platforms);
				const githubOidcSubjectPrefix = await getGithubOidcSubjectPrefix(platforms.github.repository);
				return { platforms, manifest, githubOidcSubjectPrefix };
			},
		);
		const { infisicalToken, infisicalProjectId } = await _phase(
			"Reconciling the Infisical project",
			"Infisical project ready",
			async () => {
				const infisicalToken = await _getInfisicalToken();
				const infisicalProjectId = await reconcileInfisicalProject({ platforms, manifest }, infisicalToken);
				return { infisicalToken, infisicalProjectId };
			},
		);
		await _phase("Reconciling Cloudflare remote state", "Cloudflare remote state ready", async () => {
			await ensurePrivateR2Bucket(manifest);
			await ensureBootstrapFolders(infisicalProjectId, infisicalToken);
			const cloudflareToken = await resolveCloudflareBootstrapToken(infisicalProjectId, infisicalToken);
			await reconcileR2Credentials({ platforms, manifest, infisicalProjectId, infisicalToken, cloudflareToken });
		});
		await _phase("Reconciling generated secret folders", "Generated secret folders ready", () =>
			applyGeneratedFolders(infisicalProjectId, infisicalToken),
		);
		await _phase("Reconciling manual secret placeholders", "Manual secret placeholders ready", () =>
			ensureManualSecrets({ manifest: manifest, projectId: infisicalProjectId, infisicalToken: infisicalToken }),
		);
		await _phase("Reconciling provider credentials", "Provider credentials ready", async () => {
			await reconcileMetaAppSecret(infisicalProjectId, infisicalToken);
			await reconcileUpstashApiKey(platforms, infisicalProjectId, infisicalToken);
			await reconcileNeonAccountApiKey({ platforms, manifest }, infisicalProjectId, infisicalToken);
		});
		const googleAuth = await _phase(
			"Reconciling Google Cloud and GitHub trust",
			"Google Cloud trust ready",
			async () => {
				await reconcileGoogleProjects({ platforms, manifest }, infisicalProjectId, infisicalToken);
				return applyGoogleGithubAuth(infisicalProjectId, infisicalToken, githubOidcSubjectPrefix);
			},
		);
		await _phase("Reconciling CI execution identities", "CI execution identities ready", async () => {
			for (const environment of ENVIRONMENTS) {
				const identityId = await reconcileInfisicalIdentity({
					manifest,
					projectId: infisicalProjectId,
					infisicalToken,
					environment,
					githubOidcSubjectPrefix,
				});
				await reconcileGithubEnvironment({ platforms, manifest, environment, identityId, googleAuth });
			}
		});
		await _phase("Verifying remote state access", "Remote state access verified", async () => {
			for (const environment of ENVIRONMENTS) {
				const credentials = await getBackendCredentials(infisicalProjectId, infisicalToken, environment);
				if (!(await probeR2Credentials({ platforms, manifest, ...credentials }))) {
					throw new Error(`Final ${environment} R2 verification failed.`);
				}
			}
		});
		finishBootstrapUi();
	} finally {
		releaseLock();
	}
}

_main().catch((error) => {
	failBootstrapUi(redactSecrets(error instanceof Error ? error.message : error, knownSecrets));
	process.exitCode = 1;
});
