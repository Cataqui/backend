import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

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
const apiWranglerConfig = ts.readConfigFile(
	resolve(process.cwd(), "src/platform/cloudflare/workers/api/wrangler.jsonc"),
	ts.sys.readFile,
).config as {
	queues: WranglerQueueEnvironment["queues"];
	env: Record<"staging" | "production", WranglerQueueEnvironment>;
};
const webhookWranglerConfig = ts.readConfigFile(
	resolve(process.cwd(), "src/platform/cloudflare/workers/webhooks/wrangler.jsonc"),
	ts.sys.readFile,
).config as {
	queues: Pick<WranglerQueueEnvironment["queues"], "producers">;
	env: Record<"staging" | "production", { queues: Pick<WranglerQueueEnvironment["queues"], "producers"> }>;
};
const deriveJobDataQueueBaseName = queueManifest["derive_job_data"]?.base_name;

describe("Cloudflare Queue infrastructure contract", () => {
	it("should use the Terraform Queue name in the runtime Queue router", () => {
		expect("cataqui-api-derive-job-data").toBe(deriveJobDataQueueBaseName);
	});

	it.each(["staging", "production"] as const)(
		"should bind the Terraform primary Queue in the %s Wrangler environment",
		(environment) => {
			expect({
				producer: apiWranglerConfig.env[environment].queues.producers[0]?.queue,
				consumer: apiWranglerConfig.env[environment].queues.consumers[0]?.queue,
			}).toEqual({
				producer: `${deriveJobDataQueueBaseName}-${environment}`,
				consumer: `${deriveJobDataQueueBaseName}-${environment}`,
			});
		},
	);

	it.each(["staging", "production"] as const)(
		"should bind the Terraform dead-letter Queue in the %s Wrangler environment",
		(environment) => {
			expect(apiWranglerConfig.env[environment].queues.consumers[0]?.dead_letter_queue).toBe(
				`${deriveJobDataQueueBaseName}-${environment}-dlq`,
			);
		},
	);

	it("should explicitly name local Wrangler Queue emulation for the development environment", () => {
		expect({
			producer: apiWranglerConfig.queues.producers[0]?.queue,
			consumer: apiWranglerConfig.queues.consumers[0]?.queue,
			deadLetter: apiWranglerConfig.queues.consumers[0]?.dead_letter_queue,
		}).toEqual({
			producer: `${deriveJobDataQueueBaseName}-development`,
			consumer: `${deriveJobDataQueueBaseName}-development`,
			deadLetter: `${deriveJobDataQueueBaseName}-development-dlq`,
		});
	});

	it.each(["staging", "production"] as const)(
		"should bind the %s WhatsApp Queue producer to the webhook Worker and consumer to the API Worker",
		(environment) => {
			expect({
				producer: webhookWranglerConfig.env[environment].queues.producers[0]?.queue,
				consumer: apiWranglerConfig.env[environment].queues.consumers[1]?.queue,
			}).toEqual({
				producer: `cataqui-api-verify-whatsapp-auth-message-${environment}`,
				consumer: `cataqui-api-verify-whatsapp-auth-message-${environment}`,
			});
		},
	);
});
