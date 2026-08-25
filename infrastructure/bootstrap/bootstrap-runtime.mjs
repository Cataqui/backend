import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { redactSecrets } from "./reconciliation.mjs";

const bootstrapDirectory = dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = resolve(bootstrapDirectory, "../..");
export const platformsPath = join(repositoryRoot, "infrastructure/platforms.json");
export const knownSecrets = new Set();

export function log(message) {
	stdout.write(`${message}\n`);
}

export function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? repositoryRoot,
		env: options.env ?? process.env,
		encoding: "utf8",
		stdio: options.inherit ? "inherit" : "pipe",
	});
	if (result.error) throw new Error(`Unable to execute ${command}: ${result.error.message}`);
	if (result.status !== 0 && !options.allowFailure) {
		const detail = redactSecrets(result.stderr || result.stdout || "command failed", knownSecrets);
		throw new Error(`${command} failed: ${detail.trim()}`);
	}
	return result;
}

export function requireTool(command, versionArgs = ["--version"]) {
	run(command, versionArgs);
}

export async function promptHidden({ message, unavailableMessage }) {
	if (!stdin.isTTY || !stdout.isTTY) throw new Error(unavailableMessage);
	stdout.write(message);
	run("stty", ["-echo"], { inherit: true });
	let reader;
	try {
		reader = createInterface({ input: stdin, output: stdout });
		const value = (await reader.question("")).trim();
		if (value) knownSecrets.add(value);
		return value;
	} finally {
		reader?.close();
		run("stty", ["echo"], { inherit: true });
		stdout.write("\n");
	}
}

export function acquireLock() {
	const path = join(tmpdir(), "cataqui-infrastructure-bootstrap.lock");
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const descriptor = openSync(path, "wx", 0o600);
			writeFileSync(descriptor, String(process.pid));
			closeSync(descriptor);
			return () => {
				if (existsSync(path)) unlinkSync(path);
			};
		} catch (error) {
			if (error?.code !== "EEXIST") throw error;
			const ownerPid = Number.parseInt(readFileSync(path, "utf8"), 10);
			try {
				process.kill(ownerPid, 0);
				throw new Error(`Infrastructure bootstrap is already running as process ${ownerPid}.`);
			} catch (ownerError) {
				if (ownerError?.code !== "ESRCH") throw ownerError;
				unlinkSync(path);
			}
		}
	}
	throw new Error("Unable to acquire the infrastructure bootstrap lock.");
}

export async function requestJson(url, { method = "GET", headers = {}, body, acceptedStatuses = [200] } = {}) {
	const response = await fetch(url, {
		method,
		headers: { accept: "application/json", ...headers, ...(body ? { "content-type": "application/json" } : {}) },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!acceptedStatuses.includes(response.status)) {
		const responseText = redactSecrets(await response.text(), knownSecrets);
		throw new Error(`${method} ${new URL(url).pathname} failed with ${response.status}: ${responseText.slice(0, 500)}`);
	}
	if (response.status === 204) return undefined;
	return response.json();
}
