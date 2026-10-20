import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type WorkspaceManifest = {
	name: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

it("should provide every workspace dependency needed by the isolated Docker install", () => {
	const root = resolve(import.meta.dirname, "../../..");
	const dockerfile = readFileSync(resolve(import.meta.dirname, "../Dockerfile"), "utf8");
	const installContext = dockerfile.slice(0, dockerfile.indexOf("pnpm install"));
	const copiedPackages = new Map<string, WorkspaceManifest>();
	for (const copy of installContext.matchAll(/^COPY (.+)$/gm)) {
		for (const source of copy[1]!.trim().split(/\s+/).slice(0, -1)) {
			if (!source.endsWith("package.json")) continue;
			const manifest: WorkspaceManifest = JSON.parse(readFileSync(resolve(root, source), "utf8"));
			copiedPackages.set(manifest.name, manifest);
		}
	}
	const missing: string[] = [];
	for (const manifest of copiedPackages.values()) {
		for (const dependencies of [
			manifest.dependencies,
			manifest.devDependencies,
			manifest.optionalDependencies,
			manifest.peerDependencies,
		]) {
			for (const [dependency, version] of Object.entries(dependencies ?? {})) {
				if (version.startsWith("workspace:") && !copiedPackages.has(dependency))
					missing.push(`${manifest.name} requires ${dependency}`);
			}
		}
	}

	expect({ application: copiedPackages.has("@cataqui/api"), missing: missing }).toEqual({
		application: true,
		missing: [],
	});
});
