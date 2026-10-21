import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const _root = fileURLToPath(new URL("../../", import.meta.url));
const _projects = ts.sys
	.readDirectory(
		_root,
		[".json"],
		["**/node_modules", "**/dist", "**/generated", "**/coverage", "**/.wrangler", "**/.cloudflare"],
		["tsconfig*.json", "build/tsconfig.json"],
	)
	.map((file) => {
		const config = ts.readConfigFile(file, ts.sys.readFile);
		if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
		const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(file));
		expect(parsed.errors, file).toEqual([]);
		return {
			file: relative(_root, file),
			program: ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options }),
		};
	});

it("typechecks every Mapshot source, script and test, including schema regression tests", () => {
	const checked = new Set(
		_projects.flatMap((project) => project.program.getSourceFiles().map((file) => file.fileName)),
	);
	const files = ts.sys.readDirectory(
		_root,
		[".ts"],
		["**/node_modules", "**/dist", "**/generated", "**/coverage", "**/.wrangler", "**/.cloudflare"],
		["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts", "vitest.config.ts"],
	);
	expect(files.filter((file) => !checked.has(file)).map((file) => relative(_root, file))).toEqual([]);
});
