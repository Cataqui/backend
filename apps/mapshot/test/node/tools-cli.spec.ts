import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const _exec = promisify(execFile);
const _tools = fileURLToPath(new URL("../../dist/tools/", import.meta.url));

it("compiled domain-data ingress exits with a sanitized error for invalid options", async () => {
	await expect(
		_exec(process.execPath, [join(_tools, "domain-data.mjs"), "--private-invalid-option", "must-not-appear"]),
	).rejects.toMatchObject({
		code: 1,
		stdout: "",
		stderr: "Mapshot domain command failed; provider details were suppressed to protect credentials.\n",
	});
});
