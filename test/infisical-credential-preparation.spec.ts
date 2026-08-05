import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const credentialPreparationScript = resolve(
	repositoryRoot,
	".github/actions/load-infisical-secrets/prepare-credentials.mjs",
);
const temporaryDirectories: string[] = [];

function _runCredentialPreparation(params: { profile: string; secretFile: string }): {
	githubOutput: string;
	status: number | null;
	stderr: string;
	stdout: string;
} {
	const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "cataqui-infisical-test-"));
	temporaryDirectories.push(temporaryDirectory);

	const secretFilePath = resolve(temporaryDirectory, "infisical-secrets");
	const githubOutputPath = resolve(temporaryDirectory, "github-output");
	writeFileSync(secretFilePath, params.secretFile);
	writeFileSync(githubOutputPath, "");

	const result = spawnSync(process.execPath, [credentialPreparationScript], {
		cwd: repositoryRoot,
		encoding: "utf8",
		env: {
			...process.env,
			GITHUB_OUTPUT: githubOutputPath,
			INFISICAL_PROFILE: params.profile,
			INFISICAL_SECRETS_FILE: secretFilePath,
		},
	});

	return {
		githubOutput: readFileSync(githubOutputPath, "utf8"),
		status: result.status,
		stderr: result.stderr,
		stdout: result.stdout,
	};
}

afterEach(() => {
	for (const temporaryDirectory of temporaryDirectories.splice(0)) {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
});

describe("Infisical credential preparation", () => {
	it("should mask and expose exactly the credentials selected by the profile", () => {
		const result = _runCredentialPreparation({
			profile: "database-migration",
			secretFile: [
				"DATABASE_OWNER_DIRECT_URL='postgresql://direct.example/cataqui'",
				"NEON_API_KEY='neon-api-key'",
				"NEON_PROJECT_ID='neon-project-id'",
			].join("\n"),
		});

		expect({
			githubOutput: result.githubOutput,
			maskCommands: result.stdout.match(/::add-mask::/g)?.length,
			status: result.status,
		}).toEqual({
			githubOutput: [
				"database_owner_direct_url=postgresql://direct.example/cataqui",
				"neon_api_key=neon-api-key",
				"neon_project_id=neon-project-id",
				"",
			].join("\n"),
			maskCommands: 3,
			status: 0,
		});
	});

	it("should reject an empty Infisical credential file", () => {
		const result = _runCredentialPreparation({ profile: "database-migration", secretFile: "" });

		expect(result.stderr).toContain("empty Infisical credential file");
	});

	it("should reject a malformed Infisical credential entry", () => {
		const result = _runCredentialPreparation({
			profile: "database-migration",
			secretFile: "DATABASE_OWNER_DIRECT_URL=unquoted",
		});

		expect(result.stderr).toContain("malformed Infisical credential entry");
	});

	it("should reject a duplicate Infisical credential", () => {
		const result = _runCredentialPreparation({
			profile: "database-migration",
			secretFile: [
				"DATABASE_OWNER_DIRECT_URL='first'",
				"DATABASE_OWNER_DIRECT_URL='second'",
				"NEON_API_KEY='neon-api-key'",
				"NEON_PROJECT_ID='neon-project-id'",
			].join("\n"),
		});

		expect(result.stderr).toContain("duplicate Infisical credential: DATABASE_OWNER_DIRECT_URL");
	});

	it("should reject a credential that does not belong to the selected profile", () => {
		const result = _runCredentialPreparation({
			profile: "database-migration",
			secretFile: [
				"DATABASE_OWNER_DIRECT_URL='postgresql://direct.example/cataqui'",
				"NEON_API_KEY='neon-api-key'",
				"NEON_PROJECT_ID='neon-project-id'",
				"CLOUDFLARE_DEPLOYMENT_API_TOKEN='cloudflare-deployment-api-token'",
			].join("\n"),
		});

		expect(result.stderr).toContain("unexpected Infisical credential in isolated profile");
	});

	it("should reject a missing credential from the selected profile", () => {
		const result = _runCredentialPreparation({
			profile: "database-migration",
			secretFile: [
				"DATABASE_OWNER_DIRECT_URL='postgresql://direct.example/cataqui'",
				"NEON_API_KEY='neon-api-key'",
			].join("\n"),
		});

		expect(result.stderr).toContain("missing Infisical credentials: NEON_PROJECT_ID");
	});

	it("should reject an empty credential from the selected profile", () => {
		const result = _runCredentialPreparation({
			profile: "database-migration",
			secretFile: [
				"DATABASE_OWNER_DIRECT_URL=''",
				"NEON_API_KEY='neon-api-key'",
				"NEON_PROJECT_ID='neon-project-id'",
			].join("\n"),
		});

		expect(result.stderr).toContain("empty Infisical credentials: DATABASE_OWNER_DIRECT_URL");
	});
});
