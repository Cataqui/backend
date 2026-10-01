import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, relative, resolve } from "node:path";

const repositoryRoot = process.cwd();
const applicationDirectories = [
	"apps/api",
	"apps/workers/webhooks",
	"apps/workers/geosearch",
	"apps/workers/geoimage",
] as const;
const sharedPackageDirectories = ["packages/api-internal-ingress", "packages/microservices-auth-schemas"] as const;
const workspaceDirectories = [...applicationDirectories, ...sharedPackageDirectories] as const;

function _readPackageJson(workspaceDirectory: (typeof workspaceDirectories)[number]): Record<string, unknown> {
	return JSON.parse(readFileSync(resolve(repositoryRoot, workspaceDirectory, "package.json"), "utf8")) as Record<
		string,
		unknown
	>;
}

function _getTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entryName) => {
		const entryPath = resolve(directory, entryName);
		if (statSync(entryPath).isDirectory()) {
			if (["coverage", "dist", "node_modules"].includes(entryName)) return [];
			return _getTypeScriptFiles(entryPath);
		}

		return [".cts", ".mts", ".ts", ".tsx"].includes(extname(entryName)) ? [entryPath] : [];
	});
}

function _getImportSpecifiers(source: string): string[] {
	return [...source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)].flatMap((match) =>
		match[2] === undefined ? [] : [match[2]],
	);
}

describe("backend workspace boundaries", () => {
	it("should keep the skill registry and installations only at the repository root", () => {
		const rootSkillRegistry = JSON.parse(readFileSync(resolve(repositoryRoot, "skills-lock.json"), "utf8")) as {
			skills: Record<string, unknown>;
		};
		const rootSkillDirectories = readdirSync(resolve(repositoryRoot, ".agents/skills"))
			.filter((entryName) => statSync(resolve(repositoryRoot, ".agents/skills", entryName)).isDirectory())
			.sort();
		const scopedSkillPaths = [
			"apps/api/skills-lock.json",
			"apps/api/.agents/skills",
			"apps/workers/skills-lock.json",
			"apps/workers/.agents/skills",
		].filter((skillPath) => existsSync(resolve(repositoryRoot, skillPath)));

		expect({
			rootSkillDirectories,
			scopedSkillPaths,
		}).toEqual({
			rootSkillDirectories: [...Object.keys(rootSkillRegistry.skills), "unit-test-writer"].sort(),
			scopedSkillPaths: [],
		});
	});

	it("should declare only the intentional workspace package scopes", () => {
		const workspaceSource = readFileSync(resolve(repositoryRoot, "pnpm-workspace.yaml"), "utf8");

		expect(workspaceSource).toMatch(
			/^packages:\n {2}- 'apps\/api'\n {2}- 'apps\/workers\/\*'\n {2}- 'packages\/\*'\ninjectWorkspacePackages: true$/m,
		);
	});

	it("should expose shared packages only through compiled dist entrypoints", () => {
		for (const packageDirectory of sharedPackageDirectories) {
			const packageJson = _readPackageJson(packageDirectory);
			const serializedExports = JSON.stringify(packageJson.exports);

			expect(packageJson.files, packageDirectory).toContain("dist");
			expect(serializedExports, packageDirectory).toContain("./dist/");
			expect(serializedExports, packageDirectory).not.toContain("./src/");
		}
	});

	it("should resolve only the three compiled authentication scopes", () => {
		const manifestPath = resolve(repositoryRoot, "packages/microservices-auth-schemas/package.json");
		const manifest = _readPackageJson("packages/microservices-auth-schemas");
		expect(Object.keys(manifest.exports as Record<string, unknown>)).toEqual(["./geoimage", "./geosearch", "./jwks"]);
		const resolveImport = (specifier: string) =>
			execFileSync(
				process.execPath,
				["--input-type=module", "-e", "console.log(import.meta.resolve(process.argv[1]))", specifier],
				{ cwd: dirname(manifestPath), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
			).trim();
		for (const scope of ["geoimage", "geosearch", "jwks"]) {
			const entrypoint = resolveImport(`@cataqui/microservices-auth-schemas/${scope}`);
			expect(entrypoint).toBe(new URL(`file://${resolve(dirname(manifestPath), `dist/${scope}/index.js`)}`).href);
			expect(existsSync(new URL(entrypoint))).toBe(true);
		}
		for (const specifier of [
			"@cataqui/microservices-auth-schemas",
			"@cataqui/microservices-auth-schemas/geoimage/geoimage-access-token.constants",
			"@cataqui/microservices-auth-contracts",
		]) {
			expect(() => resolveImport(specifier)).toThrow();
		}
	});

	it("should keep shared package runtime dependencies neutral", () => {
		for (const packageDirectory of sharedPackageDirectories) {
			const packageJson = _readPackageJson(packageDirectory);
			expect(Object.keys((packageJson.dependencies ?? {}) as Record<string, string>), packageDirectory).toEqual([
				"zod",
			]);
		}
	});

	it("should keep the intended shared-package consumer graph", () => {
		const workspaceDependencies = Object.fromEntries(
			applicationDirectories.map((applicationDirectory) => {
				const packageJson = _readPackageJson(applicationDirectory);
				const dependencies = (packageJson.dependencies ?? {}) as Record<string, string>;
				return [
					packageJson.name,
					Object.entries(dependencies)
						.filter(([dependencyName]) => dependencyName.startsWith("@cataqui/"))
						.sort(([firstName], [secondName]) => firstName.localeCompare(secondName)),
				];
			}),
		);

		expect(workspaceDependencies).toEqual({
			"@cataqui/api": [
				["@cataqui/api-internal-ingress", "workspace:*"],
				["@cataqui/microservices-auth-schemas", "workspace:*"],
			],
			"@cataqui/geoimage-worker": [["@cataqui/microservices-auth-schemas", "workspace:*"]],
			"@cataqui/geosearch-worker": [["@cataqui/microservices-auth-schemas", "workspace:*"]],
			"@cataqui/webhooks-worker": [["@cataqui/api-internal-ingress", "workspace:*"]],
		});
	});

	it("should prohibit application imports and relative imports across workspace boundaries", () => {
		const violations: string[] = [];

		for (const workspaceDirectory of workspaceDirectories) {
			const absoluteWorkspaceDirectory = resolve(repositoryRoot, workspaceDirectory);
			for (const filePath of _getTypeScriptFiles(absoluteWorkspaceDirectory)) {
				const source = readFileSync(filePath, "utf8");
				for (const importSpecifier of _getImportSpecifiers(source)) {
					if (
						/^(?:@cataqui\/(?:api|webhooks-worker|geosearch-worker|geoimage-worker)(?:\/|$)|apps\/)/.test(
							importSpecifier,
						)
					) {
						violations.push(`${relative(repositoryRoot, filePath)} imports ${importSpecifier}`);
						continue;
					}

					if (!importSpecifier.startsWith(".") || filePath.endsWith("vitest.config.ts")) continue;
					const importedPath = resolve(dirname(filePath), importSpecifier);
					const relativeImportedPath = relative(absoluteWorkspaceDirectory, importedPath);
					if (
						relativeImportedPath === ".." ||
						relativeImportedPath.startsWith(`..${process.platform === "win32" ? "\\\\" : "/"}`)
					) {
						violations.push(`${relative(repositoryRoot, filePath)} imports ${importSpecifier}`);
					}
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it("should consume shared packages only through declared public exports", () => {
		const allowedImports = new Set(
			sharedPackageDirectories.flatMap((directory) => {
				const manifest = _readPackageJson(directory);
				return Object.keys(manifest.exports as Record<string, unknown>).map((entrypoint) =>
					entrypoint === "." ? String(manifest.name) : `${manifest.name}${entrypoint.slice(1)}`,
				);
			}),
		);
		const violations = applicationDirectories.flatMap((applicationDirectory) =>
			_getTypeScriptFiles(resolve(repositoryRoot, applicationDirectory)).flatMap((filePath) =>
				_getImportSpecifiers(readFileSync(filePath, "utf8"))
					.filter((specifier) =>
						/^@cataqui\/(?:api-internal-ingress|microservices-auth-schemas)(?:\/|$)/.test(specifier),
					)
					.filter((specifier) => !allowedImports.has(specifier))
					.map((specifier) => `${relative(repositoryRoot, filePath)} imports ${specifier}`),
			),
		);

		expect(violations).toEqual([]);
	});
});
