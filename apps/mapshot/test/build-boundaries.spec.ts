import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

async function _files(params: { directory: string }): Promise<string[]> {
	const entries = await readdir(params.directory, { withFileTypes: true });
	return (
		await Promise.all(
			entries.map(async (entry) => {
				const path = resolve(params.directory, entry.name);
				if (entry.isDirectory()) return _files({ directory: path });
				return /\.(?:ts|mjs)$/.test(entry.name) && !entry.name.endsWith(".spec.ts") ? [path] : [];
			}),
		)
	).flat();
}

it("keeps runtime independent of build/scripts and build independent of scripts", async () => {
	const root = resolve(import.meta.dirname, "..");
	const violations: string[] = [];
	for (const directory of ["src", "build"]) {
		for (const path of await _files({ directory: resolve(root, directory) })) {
			const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
			const visit = (node: ts.Node): void => {
				let specifier: string | undefined;
				if (
					(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
					node.moduleSpecifier &&
					ts.isStringLiteral(node.moduleSpecifier)
				)
					specifier = node.moduleSpecifier.text;
				if (
					ts.isCallExpression(node) &&
					(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
						(ts.isIdentifier(node.expression) && node.expression.text === "require"))
				) {
					const argument = node.arguments[0];
					if (argument && ts.isStringLiteral(argument)) specifier = argument.text;
				}
				if (specifier?.startsWith(".")) {
					const target = relative(root, resolve(dirname(path), specifier));
					if (target.startsWith("scripts/") || (directory === "src" && target.startsWith("build/")))
						violations.push(`${relative(root, path)} imports ${specifier}`);
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
		}
	}
	expect(violations).toEqual([]);
});
