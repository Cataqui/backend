import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
const supportedCommands = new Set(["init", "test", "validate"]);

if (!supportedCommands.has(command)) {
	throw new Error("OpenTofu root command must be init, test, or validate.");
}

const rootsDirectory = fileURLToPath(new URL("./roots/", import.meta.url));
const rootNames = readdirSync(rootsDirectory, { withFileTypes: true })
	.filter(
		(entry) =>
			entry.isDirectory() && existsSync(fileURLToPath(new URL(`./roots/${entry.name}/versions.tf`, import.meta.url))),
	)
	.map((entry) => entry.name)
	.sort();

if (rootNames.length === 0) {
	throw new Error("No OpenTofu roots were found.");
}

for (const rootName of rootNames) {
	const rootDirectory = fileURLToPath(new URL(`./roots/${rootName}/`, import.meta.url));
	const commandArguments = [`-chdir=${rootDirectory}`, command];

	if (command === "init") {
		commandArguments.push("-backend=false");
	}

	console.log(`OpenTofu ${command}: ${rootName}`);
	const result = spawnSync("tofu", commandArguments, { stdio: "inherit" });

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
