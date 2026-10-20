import { relative, resolve } from "node:path";
import ts from "typescript";
it("keeps NestJS application sources and Node imports out of the Worker program", () => {
	const root = resolve(import.meta.dirname, "..");
	const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
	expect(parsed.errors).toEqual([]);
	const program = ts.createProgram({
		rootNames: parsed.fileNames.filter(
			(file) => !file.includes("/test/") && !file.endsWith(".spec.ts") && !file.endsWith("vitest.config.ts"),
		),
		options: parsed.options,
	});
	const violations = program
		.getSourceFiles()
		.filter((file) => !file.isDeclarationFile)
		.filter((file) => {
			if (file.fileName.startsWith(resolve(root, "../src") + "/")) return true;
			return (
				file.fileName.startsWith(root + "/src/") &&
				ts.preProcessFile(file.text).importedFiles.some((entry) => entry.fileName.startsWith("node:"))
			);
		})
		.map((file) => relative(root, file.fileName));
	expect(violations).toEqual([]);
});
