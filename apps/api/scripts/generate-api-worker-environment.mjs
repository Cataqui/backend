import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const wranglerEnvironmentPath = resolve("api-worker-env.d.ts");
const portableEnvironmentPath = resolve("api-worker-environment.ts");
const workersTypesPath = resolve("node_modules/@cloudflare/workers-types/index.ts");

const wranglerEnvironmentSource = ts.createSourceFile(
	wranglerEnvironmentPath,
	readFileSync(wranglerEnvironmentPath, "utf8"),
	ts.ScriptTarget.Latest,
	true,
	ts.ScriptKind.TS,
);
const workersTypesSource = ts.createSourceFile(
	workersTypesPath,
	readFileSync(workersTypesPath, "utf8"),
	ts.ScriptTarget.Latest,
	true,
	ts.ScriptKind.TS,
);

const generatedEnvironmentInterface = wranglerEnvironmentSource.statements.find(
	(statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === "ApiWorkerEnv",
);
if (generatedEnvironmentInterface === undefined || !ts.isInterfaceDeclaration(generatedEnvironmentInterface)) {
	throw new Error("Wrangler did not generate the ApiWorkerEnv interface.");
}

const generatedBaseEnvironmentName = generatedEnvironmentInterface.heritageClauses?.[0]?.types[0]?.expression;
if (generatedBaseEnvironmentName === undefined || !ts.isIdentifier(generatedBaseEnvironmentName)) {
	throw new Error("Wrangler did not generate the ApiWorkerEnv base interface.");
}

const generatedBaseEnvironment = wranglerEnvironmentSource.statements.find(
	(statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === generatedBaseEnvironmentName.text,
);
if (generatedBaseEnvironment === undefined || !ts.isInterfaceDeclaration(generatedBaseEnvironment)) {
	throw new Error("Wrangler's generated ApiWorkerEnv base interface was not found.");
}

const exportedWorkersTypeNames = new Set(
	workersTypesSource.statements.flatMap((statement) => {
		if (
			!ts.canHaveModifiers(statement) ||
			!ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ||
			!(
				ts.isInterfaceDeclaration(statement) ||
				ts.isTypeAliasDeclaration(statement) ||
				ts.isClassDeclaration(statement)
			) ||
			statement.name === undefined
		) {
			return [];
		}

		return [statement.name.text];
	}),
);
const importedWorkersTypeNames = new Set();

const portableEnvironmentInterface = ts.factory.createInterfaceDeclaration(
	[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
	"ApiWorkerEnvironment",
	undefined,
	undefined,
	generatedBaseEnvironment.members,
);

const transformedEnvironment = ts.transform(portableEnvironmentInterface, [
	(context) => {
		const visitNode = (node) => {
			if (
				ts.isTypeReferenceNode(node) &&
				ts.isIdentifier(node.typeName) &&
				exportedWorkersTypeNames.has(node.typeName.text)
			) {
				importedWorkersTypeNames.add(node.typeName.text);

				return ts.factory.updateTypeReferenceNode(
					node,
					node.typeName,
					node.typeName.text === "DurableObjectNamespace" ? undefined : node.typeArguments,
				);
			}

			return ts.visitEachChild(node, visitNode, context);
		};

		return (node) => ts.visitNode(node, visitNode);
	},
]).transformed[0];

const workersTypesImport = ts.factory.createImportDeclaration(
	undefined,
	ts.factory.createImportClause(
		true,
		undefined,
		ts.factory.createNamedImports(
			[...importedWorkersTypeNames]
				.sort()
				.map((typeName) => ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(typeName))),
		),
	),
	ts.factory.createStringLiteral("@cloudflare/workers-types/index"),
);

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
let generatedPortableEnvironment = `// Generated from api-worker-env.d.ts by pnpm cf:types. Do not edit manually.\n${printer.printNode(ts.EmitHint.Unspecified, workersTypesImport, wranglerEnvironmentSource)}\n\n${printer.printNode(ts.EmitHint.Unspecified, transformedEnvironment, wranglerEnvironmentSource)}\n`;

const formattedEnvironmentPath = `${portableEnvironmentPath}.${randomUUID()}.tmp.ts`;
try {
	writeFileSync(formattedEnvironmentPath, generatedPortableEnvironment);
	execFileSync(resolve("../../node_modules/.bin/biome"), ["format", "--write", formattedEnvironmentPath]);
	generatedPortableEnvironment = readFileSync(formattedEnvironmentPath, "utf8");
} finally {
	rmSync(formattedEnvironmentPath, { force: true });
}

if (process.argv.includes("--check")) {
	if (readFileSync(portableEnvironmentPath, "utf8") !== generatedPortableEnvironment) {
		throw new Error("The generated API Worker environment is outdated. Run pnpm cf:types.");
	}
} else {
	writeFileSync(portableEnvironmentPath, generatedPortableEnvironment);
}
