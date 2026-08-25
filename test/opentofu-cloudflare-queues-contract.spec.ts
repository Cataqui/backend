import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type QueueConfiguration = {
	producers: Array<{ binding: string; queue: string }>;
	consumers: Array<{
		queue: string;
		max_batch_size: number;
		max_batch_timeout: number;
		max_concurrency: number;
		max_retries: number;
		retry_delay: number;
		dead_letter_queue: string;
	}>;
};

type WorkerQueueEnvironment = {
	queues: QueueConfiguration;
};

type WorkerConfiguration = WorkerQueueEnvironment & {
	env: Record<"staging" | "production", WorkerQueueEnvironment>;
};

const repositoryRoot = process.cwd();
const infrastructureDirectory = resolve(repositoryRoot, "infrastructure");
const rootDirectory = resolve(infrastructureDirectory, "opentofu/roots/cloudflare-queues");
const workerConfiguration = ts.readConfigFile(resolve(repositoryRoot, "apps/api/wrangler.jsonc"), ts.sys.readFile)
	.config as WorkerConfiguration;

function _readInfrastructureFile(path: string): string {
	return readFileSync(resolve(infrastructureDirectory, path), "utf8");
}

function _getRootHcl(): string {
	return readdirSync(rootDirectory)
		.filter((fileName) => fileName.endsWith(".tf"))
		.sort()
		.map((fileName) => readFileSync(resolve(rootDirectory, fileName), "utf8"))
		.join("\n");
}

describe("Cloudflare Queues OpenTofu contract", () => {
	it("should pin the approved OpenTofu and Cloudflare provider versions", () => {
		const versions = _readInfrastructureFile("opentofu/roots/cloudflare-queues/versions.tf");

		expect(versions.match(/(?:required_version|version)\s*=\s*"=[^"]+"/g)).toEqual([
			'required_version = "= 1.12.6"',
			'version = "= 5.23.0"',
		]);
		expect(versions).toContain('backend "s3" {}');

		const lockfile = _readInfrastructureFile("opentofu/roots/cloudflare-queues/.terraform.lock.hcl");
		expect(lockfile).toMatch(
			/provider "registry\.opentofu\.org\/cloudflare\/cloudflare" {[\s\S]*version\s*=\s*"5\.23\.0"/,
		);
	});

	it.each([
		["staging", "staging/cloudflare-queues/terraform.tfstate"],
		["production", "production/cloudflare-queues/terraform.tfstate"],
	] as const)("should isolate the %s backend key", (environment, expectedKey) => {
		const backend = _readInfrastructureFile(`opentofu/environments/${environment}/cloudflare-queues.s3.tfbackend`);

		expect(backend.trim()).toBe(`key = "${expectedKey}"`);
		expect(backend).not.toMatch(/(?:access_key|secret_key|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=/);
	});

	it("should derive the Cloudflare account from the central platform manifest", () => {
		const rootHcl = _getRootHcl();

		expect(rootHcl).toMatch(/jsondecode\(file\("\$\{path\.module\}\/\.\.\/\.\.\/\.\.\/platforms\.json"\)\)/);
		expect(rootHcl).toMatch(/account_id\s*=\s*local\.cloudflare_account_id/g);
		expect(rootHcl).not.toMatch(/cloudflare_account_id\s*=\s*"[0-9a-f]{32}"/);
	});

	it("should manage one protected derive-job-data primary queue and DLQ", () => {
		const rootHcl = _getRootHcl();
		const manifest = JSON.parse(_readInfrastructureFile("manifest.json"));

		expect(manifest.cloudflare.queues).toEqual({
			derive_job_data_staging: {
				name: "cataqui-api-derive-job-data-staging",
				dead_letter_name: "cataqui-api-derive-job-data-staging-dlq",
			},
			derive_job_data_production: {
				name: "cataqui-api-derive-job-data-production",
				dead_letter_name: "cataqui-api-derive-job-data-production-dlq",
			},
		});
		expect(rootHcl).toMatch(/queue_name\s*=\s*each\.value\.name/);
		expect(rootHcl).toMatch(/queue_name\s*=\s*each\.value\.dead_letter_name/);
		expect(rootHcl).not.toMatch(/base_name|\$\{each\.value\.[^}]+\}-\$\{var\.environment\}/);
		expect(rootHcl).toMatch(/primary_retention_period\s*=\s*345600/);
		expect(rootHcl).toMatch(/dead_letter_retention_period\s*=\s*1209600/);
		expect(rootHcl.match(/resource "cloudflare_queue"/g)).toHaveLength(2);
		expect(rootHcl.match(/for_each\s*=\s*local\.queue_families/g)).toHaveLength(2);
		expect(rootHcl.match(/prevent_destroy\s*=\s*true/g)).toHaveLength(2);
	});

	it("should leave queue consumer behavior and dashboard pause state outside OpenTofu", () => {
		const rootHcl = _getRootHcl();

		expect(rootHcl).not.toMatch(/resource\s+"cloudflare_queue_consumer"/);
		expect(rootHcl).not.toMatch(/delivery_paused|delivery_delay/);
	});

	it("should keep provider credentials, imports, HCP configuration, and outputs out of the root", () => {
		const rootHcl = _getRootHcl();
		const committedConfiguration = [
			rootHcl,
			_readInfrastructureFile("opentofu/environments/staging/cloudflare-queues.s3.tfbackend"),
			_readInfrastructureFile("opentofu/environments/production/cloudflare-queues.s3.tfbackend"),
		].join("\n");

		expect(committedConfiguration).not.toMatch(
			/(?:api_token|api_key|access_key|secret_access_key|private_key|password)\s*=\s*"[^"$]+"/i,
		);
		expect(rootHcl).not.toMatch(/\bimport\s*{|\boutput\s+"|\bcloud\s*{|app\.terraform\.io|HCP Terraform/i);
	});

	it("should keep Wrangler as owner of producer bindings and consumer delivery behavior", () => {
		expect(
			[workerConfiguration, workerConfiguration.env.staging, workerConfiguration.env.production].map(
				(configuration) => configuration.queues,
			),
		).toEqual([
			{
				producers: [{ binding: "DERIVE_JOB_DATA_QUEUE", queue: "cataqui-api-derive-job-data-development" }],
				consumers: [
					{
						queue: "cataqui-api-derive-job-data-development",
						max_batch_size: 1,
						max_batch_timeout: 1,
						max_concurrency: 3,
						max_retries: 3,
						retry_delay: 60,
						dead_letter_queue: "cataqui-api-derive-job-data-development-dlq",
					},
				],
			},
			{
				producers: [{ binding: "DERIVE_JOB_DATA_QUEUE", queue: "cataqui-api-derive-job-data-staging" }],
				consumers: [
					{
						queue: "cataqui-api-derive-job-data-staging",
						max_batch_size: 1,
						max_batch_timeout: 1,
						max_concurrency: 1,
						max_retries: 3,
						retry_delay: 60,
						dead_letter_queue: "cataqui-api-derive-job-data-staging-dlq",
					},
				],
			},
			{
				producers: [{ binding: "DERIVE_JOB_DATA_QUEUE", queue: "cataqui-api-derive-job-data-production" }],
				consumers: [
					{
						queue: "cataqui-api-derive-job-data-production",
						max_batch_size: 1,
						max_batch_timeout: 1,
						max_concurrency: 3,
						max_retries: 3,
						retry_delay: 60,
						dead_letter_queue: "cataqui-api-derive-job-data-production-dlq",
					},
				],
			},
		]);
	});

	it("should keep the application queue manifest aligned with the OpenTofu family name", () => {
		const queueManifest = readFileSync(
			resolve(repositoryRoot, "packages/api-internal-ingress/src/queue/queue.manifest.ts"),
			"utf8",
		);
		const manifest = JSON.parse(_readInfrastructureFile("manifest.json"));
		const queueFamilyName = "cataqui-api-derive-job-data";
		const stagingQueue = manifest.cloudflare.queues.derive_job_data_staging;
		const productionQueue = manifest.cloudflare.queues.derive_job_data_production;

		expect(queueManifest).toContain(`"${queueFamilyName}"`);
		expect(stagingQueue.name).toBe(workerConfiguration.env.staging.queues.producers[0]?.queue);
		expect(stagingQueue.dead_letter_name).toBe(workerConfiguration.env.staging.queues.consumers[0]?.dead_letter_queue);
		expect(productionQueue.name).toBe(workerConfiguration.env.production.queues.producers[0]?.queue);
		expect(productionQueue.dead_letter_name).toBe(
			workerConfiguration.env.production.queues.consumers[0]?.dead_letter_queue,
		);
	});
});
