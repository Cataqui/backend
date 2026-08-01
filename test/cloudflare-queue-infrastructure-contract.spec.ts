import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { DeriveJobDataQueueConstants } from "../src/platform/cloudflare/queues/derive-job-data/derive-job-data-queue.constants";

type QueueManifest = Record<string, { base_name: string }>;

type WranglerQueueEnvironment = {
	queues: {
		producers: Array<{ queue: string }>;
		consumers: Array<{ queue: string; dead_letter_queue: string }>;
	};
};

const queueManifest = JSON.parse(
	readFileSync(resolve(process.cwd(), "infra/cloudflare/queues/queues.json"), "utf8"),
) as QueueManifest;
const wranglerConfig = ts.readConfigFile(resolve(process.cwd(), "wrangler.jsonc"), ts.sys.readFile).config as {
	queues: WranglerQueueEnvironment["queues"];
	env: Record<"staging" | "production", WranglerQueueEnvironment>;
};
const deriveJobDataQueueBaseName = queueManifest["derive_job_data"]?.base_name;

describe("Cloudflare Queue infrastructure contract", () => {
	it("should use the Terraform Queue name in the runtime Queue router", () => {
		expect(DeriveJobDataQueueConstants.BASE_NAME).toBe(deriveJobDataQueueBaseName);
	});

	it.each([
		"staging",
		"production",
	] as const)("should bind the Terraform primary Queue in the %s Wrangler environment", (environment) => {
		expect({
			producer: wranglerConfig.env[environment].queues.producers[0]?.queue,
			consumer: wranglerConfig.env[environment].queues.consumers[0]?.queue,
		}).toEqual({
			producer: `${deriveJobDataQueueBaseName}-${environment}`,
			consumer: `${deriveJobDataQueueBaseName}-${environment}`,
		});
	});

	it.each([
		"staging",
		"production",
	] as const)("should bind the Terraform dead-letter Queue in the %s Wrangler environment", (environment) => {
		expect(wranglerConfig.env[environment].queues.consumers[0]?.dead_letter_queue).toBe(
			`${deriveJobDataQueueBaseName}-${environment}-dlq`,
		);
	});

	it("should keep local Wrangler Queue emulation on the environment-independent Queue name", () => {
		expect({
			producer: wranglerConfig.queues.producers[0]?.queue,
			consumer: wranglerConfig.queues.consumers[0]?.queue,
			deadLetter: wranglerConfig.queues.consumers[0]?.dead_letter_queue,
		}).toEqual({
			producer: deriveJobDataQueueBaseName,
			consumer: deriveJobDataQueueBaseName,
			deadLetter: `${deriveJobDataQueueBaseName}-dlq`,
		});
	});
});
