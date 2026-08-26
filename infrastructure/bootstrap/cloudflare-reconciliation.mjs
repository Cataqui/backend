export function classifyCredentialResponse(status) {
	if (status >= 200 && status < 300) return "accepted";
	if (status === 401 || status === 403) return "rejected";
	return "indeterminate";
}

export function decideR2Credentials({ token, accessKeyId, secretAccessKey, probeSucceeded }) {
	const hasAccessKeyId = typeof accessKeyId === "string" && accessKeyId.length > 0;
	const hasSecretAccessKey = typeof secretAccessKey === "string" && secretAccessKey.length > 0;
	if (!token && !hasAccessKeyId && !hasSecretAccessKey) return "create";
	if (!token || !hasAccessKeyId || !hasSecretAccessKey) return "replace";
	if (token.id !== accessKeyId || token.status !== "active") return "replace";
	return probeSucceeded ? "reuse" : "replace";
}

export function getR2TokenName(manifest, environment) {
	return `${manifest.cloudflare.r2.buckets.opentofu_state}-${environment}`;
}
