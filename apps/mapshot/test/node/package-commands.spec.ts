import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const _execFile = promisify(execFile);
const _manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as {
	scripts: Record<string, string>;
};

it.each(["indexes:fetch", "indexes:verify", "indexes:container"])(
	"builds tooling before running %s in a fresh workspace",
	async (command) => {
		const directory = await mkdtemp(join(tmpdir(), "mapshot-package-command-"));
		try {
			await writeFile(
				join(directory, "package.json"),
				JSON.stringify({
					private: true,
					type: "module",
					scripts: {
						[command]: _manifest.scripts[command],
						"tools:build": "ruby prepare-tools.rb",
					},
				}),
			);
			// Stand in for the qualified Docker export, with no pre-existing dist directory.
			await writeFile(
				join(directory, "prepare-tools.rb"),
				`require 'fileutils'
FileUtils.mkdir_p('dist/tools')
File.write('dist/tools/build-data.mjs', '// qualified domain adapter export')
`,
			);
			await writeFile(join(directory, "Gemfile"), "# This command fixture uses only Ruby standard-library modules.\n");
			await mkdir(join(directory, "build/indexes"), { recursive: true });
			await writeFile(
				join(directory, "build/indexes/manage-indexes.rb"),
				`require 'json'
abort 'Build tooling must exist before the index command starts' unless File.file?('dist/tools/build-data.mjs')
puts 'COMMAND_RESULT=' + JSON.generate(ARGV)
`,
			);
			const result = await _execFile("pnpm", ["run", command, "--marker", "forwarded"], {
				cwd: directory,
				env: { ...process.env, BUNDLE_GEMFILE: join(directory, "Gemfile") },
				timeout: 15_000,
			});
			const output = result.stdout.match(/^COMMAND_RESULT=(.+)$/m)?.[1];
			expect(output).toBeDefined();
			const mode = command.split(":")[1];
			expect(JSON.parse(output!)).toEqual(
				mode === undefined ? ["--marker", "forwarded"] : ["--mode", mode, "--marker", "forwarded"],
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
);
