import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const synchronizationActionSource = readFileSync(
	resolve(process.cwd(), ".github/actions/sync-upstash-redis-to-infisical/action.yml"),
	"utf8",
);
const setupInfisicalCliActionSource = readFileSync(
	resolve(process.cwd(), ".github/actions/setup-infisical-cli/action.yml"),
	"utf8",
);

describe("Infisical Upstash credential synchronization", () => {
	it("should authenticate the official Infisical CLI through GitHub OIDC", () => {
		expect({
			pinsGitHubScript: synchronizationActionSource.includes(
				"actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd",
			),
			requestsCataquiAudience: synchronizationActionSource.includes('core.getIDToken("https://github.com/Cataqui")'),
			masksOidcToken: synchronizationActionSource.includes("core.setSecret(oidcToken)"),
			usesInfisicalOidcLogin:
				synchronizationActionSource.includes("infisical login") &&
				synchronizationActionSource.includes("--method=oidc-auth"),
		}).toEqual({
			pinsGitHubScript: true,
			requestsCataquiAudience: true,
			masksOidcToken: true,
			usesInfisicalOidcLogin: true,
		});
	});

	it("should install an exact official Infisical CLI release from npm", () => {
		expect({
			usesSharedSetup: synchronizationActionSource.includes("uses: ./.github/actions/setup-infisical-cli"),
			installsPinnedOfficialPackage: setupInfisicalCliActionSource.includes(
				"npm install --global @infisical/cli@0.43.114",
			),
			verifiesInstalledVersion: setupInfisicalCliActionSource.includes(
				'test "$(infisical --version)" = "infisical version 0.43.114"',
			),
		}).toEqual({ usesSharedSetup: true, installsPinnedOfficialPackage: true, verifiesInstalledVersion: true });
	});

	it("should create or update both runtime credentials with the official Infisical CLI", () => {
		expect({
			usesSecretsSet: synchronizationActionSource.includes("infisical secrets set"),
			synchronizesUrl: synchronizationActionSource.includes('"UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL"'),
			synchronizesToken: synchronizationActionSource.includes('"UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN"'),
		}).toEqual({
			usesSecretsSet: true,
			synchronizesUrl: true,
			synchronizesToken: true,
		});
	});

	it("should write generated credentials only to the runtime folder", () => {
		expect(synchronizationActionSource.match(/--path="\/runtime"/g)?.length).toBe(1);
	});

	it("should mask sensitive values and avoid custom Infisical REST requests", () => {
		expect({
			masksRuntimeToken: synchronizationActionSource.includes('echo "::add-mask::$UPSTASH_REDIS_REST_TOKEN"'),
			masksAccessToken: synchronizationActionSource.includes('echo "::add-mask::$infisical_access_token"'),
			usesRawInfisicalApi: /curl|\/api\/v[0-9]+\/|--request (?:PATCH|POST)/.test(synchronizationActionSource),
		}).toEqual({
			masksRuntimeToken: true,
			masksAccessToken: true,
			usesRawInfisicalApi: false,
		});
	});
});
