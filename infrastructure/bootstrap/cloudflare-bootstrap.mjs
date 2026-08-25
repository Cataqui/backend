import { createHash, createHmac, randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { knownSecrets, requestJson, run } from "./bootstrap-runtime.mjs";
import { classifyCredentialResponse, decideR2Credentials, getR2TokenName } from "./cloudflare-reconciliation.mjs";
import { getBootstrapSecret, setBootstrapSecret } from "./infisical-bootstrap.mjs";
import { constantTimeEqual, ENVIRONMENTS, resolveUniqueNamedResource } from "./reconciliation.mjs";

const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";

async function _verifyToken(token) {
	knownSecrets.add(token);
	const headers = { authorization: `Bearer ${token}` };
	const verificationResponse = await fetch(`${cloudflareApiBaseUrl}/user/tokens/verify`, {
		headers: { accept: "application/json", ...headers },
	});
	if (classifyCredentialResponse(verificationResponse.status) === "rejected") return false;
	if (!verificationResponse.ok)
		throw new Error(`Cloudflare token verification failed with ${verificationResponse.status}.`);
	const verification = await verificationResponse.json();
	if (!verification.success || verification.result?.status !== "active") return false;
	const permissionResponse = await fetch(`${cloudflareApiBaseUrl}/user/tokens/permission_groups`, {
		headers: { accept: "application/json", ...headers },
	});
	if (classifyCredentialResponse(permissionResponse.status) === "rejected") return false;
	if (!permissionResponse.ok)
		throw new Error(`Cloudflare permission verification failed with ${permissionResponse.status}.`);
	const permissionGroups = await permissionResponse.json();
	return permissionGroups.result?.some((permission) => permission.name === "API Tokens Write") ?? false;
}

async function _promptHidden(message) {
	if (!stdin.isTTY || !stdout.isTTY)
		throw new Error("A valid Cloudflare bootstrap token is missing; rerun from an interactive terminal.");
	stdout.write(message);
	run("stty", ["-echo"], { inherit: true });
	try {
		const reader = createInterface({ input: stdin, output: stdout });
		const value = await reader.question("");
		reader.close();
		stdout.write("\n");
		return value.trim();
	} finally {
		run("stty", ["echo"], { inherit: true });
	}
}

export async function resolveCloudflareBootstrapToken(platforms, infisicalToken) {
	const stored = [];
	for (const environment of ENVIRONMENTS) {
		stored.push(
			await getBootstrapSecret({ platforms, token: infisicalToken, environment, name: "CLOUDFLARE_API_TOKEN" }),
		);
	}
	const distinct = [...new Set(stored.filter(Boolean))];
	if (distinct.length > 1) throw new Error("Staging and production contain different Cloudflare bootstrap tokens.");
	let token = distinct[0];
	if (!token || !(await _verifyToken(token))) {
		token = await _promptHidden("Cloudflare API token (API Tokens Write): ");
		if (!token || !(await _verifyToken(token)))
			throw new Error("The supplied Cloudflare bootstrap token is invalid or lacks API Tokens Write.");
	}
	for (const environment of ENVIRONMENTS) {
		await setBootstrapSecret({
			platforms,
			token: infisicalToken,
			environment,
			name: "CLOUDFLARE_API_TOKEN",
			value: token,
		});
	}
	return token;
}

async function _listTokens(cloudflareToken) {
	const payload = await requestJson(`${cloudflareApiBaseUrl}/user/tokens?per_page=100`, {
		headers: { authorization: `Bearer ${cloudflareToken}` },
	});
	return payload.result ?? [];
}

async function _getR2PermissionGroup(cloudflareToken) {
	const payload = await requestJson(`${cloudflareApiBaseUrl}/user/tokens/permission_groups`, {
		headers: { authorization: `Bearer ${cloudflareToken}` },
	});
	const permissions = payload.result?.filter(
		(permission) =>
			permission.name === "Workers R2 Storage Bucket Item Write" &&
			permission.scopes?.includes("com.cloudflare.edge.r2.bucket"),
	);
	if (permissions?.length !== 1)
		throw new Error("Cloudflare must expose exactly one bucket-scoped R2 object write permission group.");
	return permissions[0];
}

async function _getToken(cloudflareToken, tokenId) {
	const payload = await requestJson(`${cloudflareApiBaseUrl}/user/tokens/${encodeURIComponent(tokenId)}`, {
		headers: { authorization: `Bearer ${cloudflareToken}` },
	});
	return payload.result;
}

function _isOwnedR2Token({ platforms, token, permissionGroupId }) {
	const bucketResource = `com.cloudflare.edge.r2.bucket.${platforms.cloudflare.account_id}_default_${platforms.cloudflare.r2.buckets.opentofu_state}`;
	return (
		token.policies?.length === 1 &&
		token.policies[0].effect === "allow" &&
		token.policies[0].permission_groups?.length === 1 &&
		token.policies[0].permission_groups[0].id === permissionGroupId &&
		Object.keys(token.policies[0].resources ?? {}).length === 1 &&
		token.policies[0].resources?.[bucketResource] === "*"
	);
}

async function _createR2Token({ platforms, cloudflareToken, name }) {
	const permission = await _getR2PermissionGroup(cloudflareToken);
	const accountId = platforms.cloudflare.account_id;
	const bucket = platforms.cloudflare.r2.buckets.opentofu_state;
	const payload = await requestJson(`${cloudflareApiBaseUrl}/user/tokens`, {
		method: "POST",
		headers: { authorization: `Bearer ${cloudflareToken}` },
		body: {
			name,
			policies: [
				{
					effect: "allow",
					permission_groups: [{ id: permission.id }],
					resources: { [`com.cloudflare.edge.r2.bucket.${accountId}_default_${bucket}`]: "*" },
				},
			],
		},
		acceptedStatuses: [200, 201],
	});
	const token = payload.result;
	if (!token?.id || !token?.value) throw new Error(`Cloudflare did not return credentials for ${name}.`);
	knownSecrets.add(token.value);
	return { id: token.id, secret: createHash("sha256").update(token.value).digest("hex") };
}

async function _deleteToken(cloudflareToken, tokenId) {
	await requestJson(`${cloudflareApiBaseUrl}/user/tokens/${encodeURIComponent(tokenId)}`, {
		method: "DELETE",
		headers: { authorization: `Bearer ${cloudflareToken}` },
		acceptedStatuses: [200],
	});
}

function _hmac(key, value, encoding) {
	return createHmac("sha256", key).update(value).digest(encoding);
}

async function _signedR2Request({ platforms, accessKeyId, secretAccessKey, method, key, body = "" }) {
	const accountId = platforms.cloudflare.account_id;
	const bucket = platforms.cloudflare.r2.buckets.opentofu_state;
	const host = `${accountId}.r2.cloudflarestorage.com`;
	const canonicalUri = `/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
	const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
	const date = amzDate.slice(0, 8);
	const payloadHash = createHash("sha256").update(body).digest("hex");
	const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
	const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
	const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
	const scope = `${date}/auto/s3/aws4_request`;
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		createHash("sha256").update(canonicalRequest).digest("hex"),
	].join("\n");
	const dateKey = _hmac(`AWS4${secretAccessKey}`, date);
	const regionKey = _hmac(dateKey, "auto");
	const serviceKey = _hmac(regionKey, "s3");
	const signingKey = _hmac(serviceKey, "aws4_request");
	const signature = _hmac(signingKey, stringToSign, "hex");
	return fetch(`https://${host}${canonicalUri}`, {
		method,
		headers: {
			authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
			"x-amz-content-sha256": payloadHash,
			"x-amz-date": amzDate,
		},
		body: method === "PUT" ? body : undefined,
	});
}

export async function probeR2Credentials({ platforms, accessKeyId, secretAccessKey }) {
	const key = `__bootstrap_probe__/${randomUUID()}`;
	const body = randomUUID();
	const put = await _signedR2Request({ platforms, accessKeyId, secretAccessKey, method: "PUT", key, body });
	if (classifyCredentialResponse(put.status) === "rejected") return false;
	if (!put.ok) throw new Error(`R2 credential verification could not write its probe (${put.status}).`);
	const get = await _signedR2Request({ platforms, accessKeyId, secretAccessKey, method: "GET", key });
	if (classifyCredentialResponse(get.status) === "rejected") return false;
	if (!get.ok) throw new Error(`R2 credential verification could not read its probe (${get.status}).`);
	if (!constantTimeEqual(await get.text(), body))
		throw new Error("R2 credential verification read unexpected probe contents.");
	const deletion = await _signedR2Request({ platforms, accessKeyId, secretAccessKey, method: "DELETE", key });
	if (!deletion.ok) throw new Error(`R2 credential verification could not remove its probe (${deletion.status}).`);
	return true;
}

function _parseWranglerJson(result, operation) {
	try {
		return JSON.parse(result.stdout);
	} catch {
		throw new Error(`Wrangler returned an invalid response while checking ${operation}.`);
	}
}

export function ensurePrivateR2Bucket(platforms) {
	const bucket = platforms.cloudflare.r2.buckets.opentofu_state;
	const info = run("wrangler", ["r2", "bucket", "info", bucket, "--json"], { allowFailure: true });
	if (info.status !== 0) {
		const output = `${info.stdout}\n${info.stderr}`;
		if (!/not found|does not exist|10006/i.test(output))
			throw new Error(`Unable to inspect R2 bucket ${bucket}: ${output.trim()}`);
		run("wrangler", ["r2", "bucket", "create", bucket]);
	} else {
		const details = _parseWranglerJson(info, bucket);
		if (details.name && details.name !== bucket)
			throw new Error(`Wrangler returned a foreign R2 bucket for ${bucket}.`);
	}
	const domains = run("wrangler", ["r2", "bucket", "domain", "list", bucket], { allowFailure: true });
	if (domains.status !== 0) throw new Error(`Unable to verify custom-domain exposure for ${bucket}.`);
	if (/https?:\/\//i.test(domains.stdout) && !/no custom domains/i.test(domains.stdout))
		throw new Error(`R2 state bucket ${bucket} has a public custom domain.`);
	const devUrl = run("wrangler", ["r2", "bucket", "dev-url", "get", bucket], { allowFailure: true });
	if (devUrl.status !== 0) throw new Error(`Unable to verify public development URL exposure for ${bucket}.`);
	if (/enabled/i.test(devUrl.stdout) && !/disabled/i.test(devUrl.stdout))
		throw new Error(`R2 state bucket ${bucket} has a public development URL.`);
}

export async function reconcileR2Credentials({ platforms, infisicalToken, cloudflareToken }) {
	let tokens = await _listTokens(cloudflareToken);
	const permission = await _getR2PermissionGroup(cloudflareToken);
	for (const environment of ENVIRONMENTS) {
		const name = getR2TokenName(platforms, environment);
		const tokenSummary = resolveUniqueNamedResource(tokens, name);
		const token = tokenSummary ? await _getToken(cloudflareToken, tokenSummary.id) : undefined;
		if (token && !_isOwnedR2Token({ platforms, token, permissionGroupId: permission.id })) {
			throw new Error(`Foreign Cloudflare token conflicts with ${name}.`);
		}
		const accessKeyId = await getBootstrapSecret({
			platforms,
			token: infisicalToken,
			environment,
			name: "R2_STATE_ACCESS_KEY_ID",
		});
		const secretAccessKey = await getBootstrapSecret({
			platforms,
			token: infisicalToken,
			environment,
			name: "R2_STATE_SECRET_ACCESS_KEY",
		});
		const probeSucceeded =
			token && accessKeyId && secretAccessKey
				? await probeR2Credentials({ platforms, accessKeyId, secretAccessKey })
				: false;
		const action = decideR2Credentials({ token, accessKeyId, secretAccessKey, probeSucceeded });
		if (action === "reuse") continue;
		if (token) await _deleteToken(cloudflareToken, token.id);
		const credentials = await _createR2Token({ platforms, cloudflareToken, name });
		await setBootstrapSecret({
			platforms,
			token: infisicalToken,
			environment,
			name: "R2_STATE_ACCESS_KEY_ID",
			value: credentials.id,
		});
		await setBootstrapSecret({
			platforms,
			token: infisicalToken,
			environment,
			name: "R2_STATE_SECRET_ACCESS_KEY",
			value: credentials.secret,
		});
		if (!(await probeR2Credentials({ platforms, accessKeyId: credentials.id, secretAccessKey: credentials.secret }))) {
			throw new Error(`New ${environment} R2 credentials could not access the state bucket.`);
		}
		tokens = await _listTokens(cloudflareToken);
	}
}
