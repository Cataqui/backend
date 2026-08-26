import { log as clackLog, intro, isCancel, note, outro, password, spinner } from "@clack/prompts";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stderr, stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { redactSecrets } from "./reconciliation.mjs";

const bootstrapDirectory = dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = resolve(bootstrapDirectory, "../..");
export const platformsPath = join(repositoryRoot, "infrastructure/platforms.json");
export const manifestPath = join(repositoryRoot, "infrastructure/manifest.json");
export const knownSecrets = new Set();

const isInteractive = Boolean(stdin.isTTY && stdout.isTTY);
let activePhase;

export function log(message) {
	if (activePhase) {
		activePhase.message = message;
		activePhase.control.message(message);
		return;
	}
	if (isInteractive) clackLog.step(message);
	else stdout.write(`${message}\n`);
}

export function startBootstrapUi() {
	if (!isInteractive) return;
	intro("Cataquí infrastructure bootstrap");
	note(
		[
			"Reconciles staging and production immediately.",
			"Healthy resources and credentials are reused.",
			"A protected secret field appears only when a required external credential is missing.",
		].join("\n"),
		"What this command does",
	);
}

export function finishBootstrapUi() {
	if (isInteractive) outro("Infrastructure bootstrap is healthy.");
	else stdout.write("Infrastructure bootstrap is healthy.\n");
}

export function failBootstrapUi(message) {
	if (isInteractive) clackLog.error(message);
	else stderr.write(`${message}\n`);
}

export async function runBootstrapPhase({ pending, complete }, operation) {
	if (!isInteractive) {
		stdout.write(`${pending}...\n`);
		const result = await operation();
		stdout.write(`${complete}.\n`);
		return result;
	}

	const control = spinner();
	activePhase = { control, message: pending };
	control.start(pending);
	try {
		await new Promise((resolvePromise) => setImmediate(resolvePromise));
		const result = await operation();
		control.stop(complete);
		return result;
	} catch (error) {
		control.error(`${pending} failed`);
		throw error;
	} finally {
		activePhase = undefined;
	}
}

export function runAsync(command, args, options = {}) {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, {
			cwd: options.cwd ?? repositoryRoot,
			env: options.env ?? process.env,
			stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
		});
		let commandStdout = "";
		let commandStderr = "";
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			commandStdout += chunk;
		});
		child.stderr?.on("data", (chunk) => {
			commandStderr += chunk;
		});
		child.once("error", (error) => rejectPromise(new Error(`Unable to execute ${command}: ${error.message}`)));
		child.once("close", (status) => {
			const result = { status, stdout: commandStdout, stderr: commandStderr };
			if (status !== 0 && !options.allowFailure) {
				const detail = redactSecrets(commandStderr || commandStdout || "command failed", knownSecrets);
				rejectPromise(new Error(`${command} failed: ${detail.trim()}`));
				return;
			}
			resolvePromise(result);
		});
	});
}

export function requireToolAsync(command, versionArgs = ["--version"]) {
	return runAsync(command, versionArgs);
}

export async function promptHidden({ title, message, guidance, unavailableMessage }) {
	if (!stdin.isTTY || !stdout.isTTY) throw new Error(unavailableMessage);
	const suspendedPhase = activePhase;
	if (suspendedPhase) {
		suspendedPhase.control.stop("Credential input required");
		activePhase = undefined;
	}
	try {
		note(guidance, title);
		const response = await password({
			message,
			mask: "•",
			validate: (value) => (value.trim() ? undefined : "A value is required."),
		});
		if (isCancel(response)) throw new Error("Infrastructure bootstrap was cancelled.");
		const value = response.trim();
		if (value) knownSecrets.add(value);
		return value;
	} finally {
		if (suspendedPhase) {
			activePhase = suspendedPhase;
			suspendedPhase.control.start(suspendedPhase.message);
		}
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
