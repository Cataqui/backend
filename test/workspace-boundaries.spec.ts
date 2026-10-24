import { existsSync, globSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const repositoryRoot = process.cwd();
const applicationDirectories = globSync("apps/**/package.json", {
	cwd: repositoryRoot,
	exclude: [
		"**/node_modules/**",
		"**/dist/**",
		"**/generated/**",
		"**/coverage/**",
		"**/target/**",
		"**/.cloudflare/**",
		"**/.worker-build/**",
	],
}).map((manifest) => dirname(manifest));
const sharedPackageDirectories = readdirSync(resolve(repositoryRoot, "packages"))
	.filter((directory) => existsSync(resolve(repositoryRoot, "packages", directory, "package.json")))
	.map((directory) => `packages/${directory}`);
const workspaceDirectories = [...applicationDirectories, ...sharedPackageDirectories] as const;

function _readPackageJson(workspaceDirectory: (typeof workspaceDirectories)[number]): Record<string, unknown> {
	return JSON.parse(readFileSync(resolve(repositoryRoot, workspaceDirectory, "package.json"), "utf8")) as Record<
		string,
		unknown
	>;
}

function _getSourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entryName) => {
		const entryPath = resolve(directory, entryName);
		if (statSync(entryPath).isDirectory()) {
			if (
				[
					"coverage",
					"dist",
					"generated",
					"target",
					"node_modules",
					".wrangler",
					".cloudflare",
					".worker-build",
				].includes(entryName) ||
				applicationDirectories.some((workspace) => resolve(repositoryRoot, workspace) === entryPath)
			)
				return [];
			return _getSourceFiles(entryPath);
		}

		return [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"].includes(extname(entryName))
			? [entryPath]
			: [];
	});
}

function _getImportSpecifiers(params: { source: string }): string[] {
	return ts.preProcessFile(params.source, true, true).importedFiles.map((reference) => reference.fileName);
}

function _supportsNodeImport(target: unknown): boolean {
	if (typeof target === "string") return true;
	if (target === null || typeof target !== "object") return false;
	return Object.entries(target).some(
		([condition, value]) => ["node", "import", "default"].includes(condition) && _supportsNodeImport(value),
	);
}

describe("backend workspace boundaries", () => {
	it("enforces the install policy through pnpm's active configuration", () => {
		const config = JSON.parse(
			execFileSync("pnpm", ["config", "list", "--json"], { cwd: repositoryRoot, encoding: "utf8" }),
		) as Record<string, unknown>;

		expect({
			shamefullyHoist: config.shamefullyHoist,
			strictPeerDependencies: config.strictPeerDependencies,
			autoInstallPeers: config.autoInstallPeers,
			sideEffectsCache: config.sideEffectsCache,
			lockfile: config.lockfile,
			preferFrozenLockfile: config.preferFrozenLockfile,
			ignoreScripts: config.ignoreScripts,
		}).toEqual({
			shamefullyHoist: false,
			strictPeerDependencies: true,
			autoInstallPeers: true,
			sideEffectsCache: true,
			lockfile: true,
			preferFrozenLockfile: true,
			ignoreScripts: false,
		});
	});

	it("checks JavaScript tooling alongside TypeScript source for workspace imports", () => {
		const directory = mkdtempSync(resolve(tmpdir(), "cataqui-workspace-boundaries-"));
		const filePath = resolve(directory, "generate.mjs");
		try {
			writeFileSync(filePath, 'import "../outside";');
			expect(_getSourceFiles(directory)).toEqual([filePath]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it.each([
		{ syntax: "CommonJS require", source: 'const outside = require("../outside");' },
		{ syntax: "side-effect import", source: 'import "../outside";' },
		{ syntax: "template-literal dynamic import", source: "await import(`../outside`);" },
		{ syntax: "import assignment", source: 'import outside = require("../outside");' },
		{ syntax: "type import", source: 'type Outside = import("../outside").Thing;' },
		{ syntax: "named import", source: 'import { Thing } from "../outside";' },
		{ syntax: "re-export", source: 'export { Thing } from "../outside";' },
	])("detects workspace boundaries in a $syntax", ({ source }) => {
		expect(_getImportSpecifiers({ source: source })).toEqual(["../outside"]);
	});

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
			rootSkillDirectories: rootSkillDirectories,
			scopedSkillPaths: scopedSkillPaths,
		}).toEqual({
			rootSkillDirectories: [...Object.keys(rootSkillRegistry.skills), "unit-test-writer"].sort(),
			scopedSkillPaths: [],
		});
	});

	it("should declare only the intentional workspace package scopes", () => {
		const workspaceSource = readFileSync(resolve(repositoryRoot, "pnpm-workspace.yaml"), "utf8");

		expect(workspaceSource).toMatch(
			/^packages:\n {2}- '\.github\/actions\/deploy-mapshot'\n {2}- 'apps\/api'\n {2}- 'apps\/mapshot'\n {2}- 'apps\/\*\/worker'\n {2}- 'apps\/\*\/workerhole'\n {2}- 'apps\/workers\/\*'\n {2}- 'packages\/\*'\n(?! {2}-)/m,
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

	it.each(sharedPackageDirectories)(
		"loads every compiled public entrypoint of %s in Node without a loader",
		(directory) => {
			const manifest = _readPackageJson(directory);
			const entrypoints = Object.entries((manifest.exports ?? {}) as Record<string, unknown>)
				.filter(([, target]) => _supportsNodeImport(target))
				.map(([entrypoint]) => entrypoint)
				.filter((entrypoint) => entrypoint !== "./package.json")
				.map((entrypoint) => (entrypoint === "." ? String(manifest.name) : `${manifest.name}${entrypoint.slice(1)}`));

			expect(() =>
				execFileSync(
					process.execPath,
					[
						"--input-type=module",
						"-e",
						"await Promise.all(process.argv.slice(1).map((specifier) => import(specifier)))",
						...entrypoints,
					],
					{ cwd: resolve(repositoryRoot, directory), stdio: "pipe" },
				),
			).not.toThrow();
		},
	);

	it("resolves the centralized places vocabulary through its compiled public export", () => {
		const packageDirectory = resolve(repositoryRoot, "packages/places");
		const resolveImport = (specifier: string): string =>
			execFileSync(
				process.execPath,
				["--input-type=module", "-e", "console.log(import.meta.resolve(process.argv[1]))", specifier],
				{ cwd: packageDirectory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
			).trim();
		for (const [specifier, file] of [
			["@cataqui/places", "index.js"],
			["@cataqui/places/style", "style.js"],
		] as const) {
			const entrypoint = resolveImport(specifier);
			expect(entrypoint).toBe(new URL(`file://${resolve(packageDirectory, "dist", file)}`).href);
			expect(existsSync(new URL(entrypoint))).toBe(true);
		}
		for (const specifier of ["@cataqui/places/google", "@cataqui/places/protomaps"]) {
			expect(() => resolveImport(specifier)).toThrow();
		}
	});

	it("should keep shared package runtime dependencies neutral", () => {
		for (const packageDirectory of sharedPackageDirectories) {
			const packageJson = _readPackageJson(packageDirectory);
			const dependencies = Object.keys((packageJson.dependencies ?? {}) as Record<string, string>);
			// Runtime integrations intentionally own platform-specific adapters through conditional exports.
			if (packageDirectory === "packages/workerhole") {
				expect(dependencies.sort()).toEqual(["capnweb", "ws"]);
				continue;
			}

			for (const dependency of dependencies) expect(["zod", "@mateo/icons", "@mateo/palette"]).toContain(dependency);
		}
	});

	it("keeps a shared package only when multiple applications consume it", () => {
		for (const packageDirectory of sharedPackageDirectories) {
			const manifest = _readPackageJson(packageDirectory);
			const consumers = applicationDirectories.filter((applicationDirectory) => {
				const application = _readPackageJson(applicationDirectory);
				const dependencies = (application.dependencies ?? {}) as Record<string, unknown>;
				return Object.hasOwn(dependencies, String(manifest.name));
			});
			expect(consumers.length, packageDirectory).toBeGreaterThanOrEqual(2);
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
			"@cataqui/ai-worker": [["@cataqui/response", "workspace:*"]],
			"@cataqui/api": [
				["@cataqui/api-workerhole", "workspace:*"],
				["@cataqui/auth-schemas", "workspace:*"],
				["@cataqui/response", "workspace:*"],
				["@cataqui/workerhole", "workspace:*"],
			],
			"@cataqui/maps-worker": [
				["@cataqui/async", "workspace:*"],
				["@cataqui/places", "workspace:*"],
				["@cataqui/response", "workspace:*"],
			],
			"@cataqui/mapshot": [
				["@cataqui/async", "workspace:*"],
				["@cataqui/mapshot-workerhole", "workspace:*"],
				["@cataqui/places", "workspace:*"],
				["@cataqui/workerhole", "workspace:*"],
			],
			"@cataqui/api-worker": [
				["@cataqui/api-workerhole", "workspace:*"],
				["@cataqui/async", "workspace:*"],
				["@cataqui/auth-schemas", "workspace:*"],
				["@cataqui/response", "workspace:*"],
				["@cataqui/workerhole", "workspace:*"],
			],
			"@cataqui/mapshot-worker": [
				["@cataqui/async", "workspace:*"],
				["@cataqui/mapshot-workerhole", "workspace:*"],
				["@cataqui/response", "workspace:*"],
				["@cataqui/workerhole", "workspace:*"],
			],
			"@cataqui/auth-worker": [
				["@cataqui/auth-schemas", "workspace:*"],
				["@cataqui/response", "workspace:*"],
			],
			"@cataqui/api-workerhole": [["@cataqui/workerhole", "workspace:*"]],
			"@cataqui/mapshot-workerhole": [["@cataqui/workerhole", "workspace:*"]],
		});
	});

	it("should prohibit application imports and relative imports across workspace boundaries", () => {
		const violations: string[] = [];
		const applications = applicationDirectories.map((directory) => ({
			name: String(_readPackageJson(directory).name),
			directory: directory,
			owner: applicationDirectories
				.filter((ancestor) => directory === ancestor || directory.startsWith(`${ancestor}/`))
				.sort((first, second) => first.length - second.length)[0],
		}));

		for (const workspaceDirectory of workspaceDirectories) {
			const absoluteWorkspaceDirectory = resolve(repositoryRoot, workspaceDirectory);
			const owningApplication = applications.find((application) => application.directory === workspaceDirectory);
			for (const filePath of _getSourceFiles(absoluteWorkspaceDirectory)) {
				const source = readFileSync(filePath, "utf8");
				for (const importSpecifier of _getImportSpecifiers({ source: source })) {
					const referencesWorkerDefinition =
						filePath.endsWith("/cloudflare.config.ts") && importSpecifier.endsWith("/cloudflare.config.ts");
					if (referencesWorkerDefinition) {
						const syntax = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
						const declarations = syntax.statements
							.filter(ts.isImportDeclaration)
							.filter(
								(declaration) =>
									ts.isStringLiteral(declaration.moduleSpecifier) &&
									declaration.moduleSpecifier.text === importSpecifier,
							);
						const importsOnlyWorkerDefinition =
							declarations.length === 1 &&
							declarations.every((declaration) => {
								const clause = declaration.importClause;
								const names = clause?.namedBindings;
								return (
									clause?.name === undefined &&
									names !== undefined &&
									ts.isNamedImports(names) &&
									names.elements.length === 1 &&
									names.elements.every((element) => (element.propertyName ?? element.name).text === "worker")
								);
							});
						if (importsOnlyWorkerDefinition) continue;
					}
					const importedApplication = applications.find(
						(application) => importSpecifier === application.name || importSpecifier.startsWith(`${application.name}/`),
					);
					const crossesApplicationBoundary =
						importedApplication !== undefined && importedApplication.owner !== owningApplication?.owner;
					const importsApplicationRuntime =
						importedApplication !== undefined && !importedApplication.directory.endsWith("/workerhole");
					if (crossesApplicationBoundary || importsApplicationRuntime || importSpecifier.startsWith("apps/")) {
						violations.push(`${relative(repositoryRoot, filePath)} imports ${importSpecifier}`);
						continue;
					}

					if (!importSpecifier.startsWith(".") || filePath.endsWith("vitest.config.ts")) continue;
					const importedPath = resolve(dirname(filePath), importSpecifier);
					const relativeImportedPath = relative(absoluteWorkspaceDirectory, importedPath);
					if (relativeImportedPath === ".." || relativeImportedPath.startsWith(`..${sep}`)) {
						violations.push(`${relative(repositoryRoot, filePath)} imports ${importSpecifier}`);
					}
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it("should consume shared packages only through declared public exports", () => {
		const allowedImports = new Set(
			workspaceDirectories.flatMap((directory) => {
				const manifest = _readPackageJson(directory);
				return Object.keys((manifest.exports ?? {}) as Record<string, unknown>).map((entrypoint) =>
					entrypoint === "." ? String(manifest.name) : `${manifest.name}${entrypoint.slice(1)}`,
				);
			}),
		);
		const violations = applicationDirectories.flatMap((applicationDirectory) =>
			_getSourceFiles(resolve(repositoryRoot, applicationDirectory)).flatMap((filePath) =>
				_getImportSpecifiers({ source: readFileSync(filePath, "utf8") })
					.filter((specifier) => specifier.startsWith("@cataqui/"))
					.filter((specifier) => !allowedImports.has(specifier))
					.map((specifier) => `${relative(repositoryRoot, filePath)} imports ${specifier}`),
			),
		);

		expect(violations).toEqual([]);
	});
});
