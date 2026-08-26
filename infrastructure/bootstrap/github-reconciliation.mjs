export function parseGithubOidcSubjectPrefix(repository, payload) {
	const [expectedOwner, expectedRepository] = repository.split("/");
	const prefix = payload?.sub_claim_prefix;
	const match =
		typeof prefix === "string" ? /^repo:([^/@]+)@([1-9][0-9]*)\/([^/@]+)@([1-9][0-9]*)$/.exec(prefix) : undefined;
	if (!match || match[1] !== expectedOwner || match[3] !== expectedRepository) {
		throw new Error(`GitHub returned an invalid immutable OIDC subject prefix for ${repository}.`);
	}
	return prefix;
}
