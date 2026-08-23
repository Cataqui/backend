import { describe, expect, it } from "vitest";
import { formatGithubOutputs, resolveAffectedWorkspaces } from "../scripts/affected-workspaces.mjs";

describe("affected workspace resolution", () => {
	it("targets an API-only runtime change", () => {
		const result = resolveAffectedWorkspaces({ changedPaths: ["apps/api/src/main.ts"] });

		expect(result.validationWorkspaces).toEqual(["@cataqui/api"]);
		expect(result.deploy).toMatchObject({ api: true, webhooks: false, geosearch: false });
		expect(result.runMigrations).toBe(true);
		expect(result.deploymentOrder).toEqual([["database:migrate"], ["application:api"]]);
	});

	it("targets each standalone Worker independently", () => {
		const webhooks = resolveAffectedWorkspaces({
			changedPaths: ["apps/workers/webhooks/src/app.ts"],
		});
		const geosearch = resolveAffectedWorkspaces({
			changedPaths: ["apps/workers/geosearch/src/app.ts"],
		});

		expect(webhooks.validationWorkspaces).toEqual(["@cataqui/webhooks-worker"]);
		expect(webhooks.deploy.webhooks).toBe(true);
		expect(webhooks.deploy.api).toBe(false);
		expect(geosearch.validationWorkspaces).toEqual(["@cataqui/geosearch-worker"]);
		expect(geosearch.deploy.geosearch).toBe(true);
		expect(geosearch.deploy.api).toBe(false);
	});

	it("expands Worker-shared configuration to both Workers", () => {
		const result = resolveAffectedWorkspaces({ changedPaths: ["apps/workers/tsconfig.json"] });

		expect(result.validationWorkspaces).toEqual(["@cataqui/webhooks-worker", "@cataqui/geosearch-worker"]);
		expect(result.deploy.webhooks).toBe(true);
		expect(result.deploy.geosearch).toBe(true);
		expect(result.deploymentOrder).toEqual([["application:webhooks", "application:geosearch"]]);
	});

	it("expands api-internal-ingress changes to the API and Webhooks in dependency order", () => {
		const result = resolveAffectedWorkspaces({
			changedPaths: ["packages/api-internal-ingress/src/index.ts"],
		});

		expect(result.validationWorkspaces).toEqual([
			"@cataqui/api-internal-ingress",
			"@cataqui/api",
			"@cataqui/webhooks-worker",
		]);
		expect(result.deploymentOrder).toEqual([["database:migrate"], ["application:api"], ["application:webhooks"]]);
	});

	it("expands auth-contract changes to the API and Geosearch in dependency order", () => {
		const result = resolveAffectedWorkspaces({
			changedPaths: ["packages/microservices-auth-contracts/src/index.ts"],
		});

		expect(result.validationWorkspaces).toEqual([
			"@cataqui/microservices-auth-contracts",
			"@cataqui/api",
			"@cataqui/geosearch-worker",
		]);
		expect(result.deploymentOrder).toEqual([["database:migrate"], ["application:api"], ["application:geosearch"]]);
	});

	it("selects individual infrastructure components before migrating and redeploying the API", () => {
		const result = resolveAffectedWorkspaces({
			changedPaths: ["infrastructure/cloudflare/modules/queue-pair/main.tf", "infrastructure/upstash/redis/redis.tf"],
		});

		expect(result.infrastructureComponents).toEqual(["queues", "upstash"]);
		expect(result.deploy.infrastructure).toEqual({
			aiGateway: false,
			queues: true,
			neon: false,
			upstash: true,
		});
		expect(result.deploymentOrder).toEqual([
			["infrastructure:queues", "infrastructure:upstash"],
			["database:migrate"],
			["application:api"],
		]);
	});

	it("treats shared infrastructure configuration as affecting every component", () => {
		const result = resolveAffectedWorkspaces({
			changedPaths: ["infrastructure/cloudflare/components.json"],
		});

		expect(result.infrastructureComponents).toEqual(["aiGateway", "queues"]);
		expect(result.deployInfrastructure).toBe(true);
	});

	it("expands root toolchain changes to every application and package", () => {
		const result = resolveAffectedWorkspaces({ changedPaths: ["pnpm-lock.yaml"] });

		expect(result.validationWorkspaces).toEqual([
			"@cataqui/api-internal-ingress",
			"@cataqui/microservices-auth-contracts",
			"@cataqui/api",
			"@cataqui/webhooks-worker",
			"@cataqui/geosearch-worker",
		]);
		expect(result.deploy).toMatchObject({ api: true, webhooks: true, geosearch: true });
	});

	it("maps container and deployment automation changes to their owning applications", () => {
		const apiContainer = resolveAffectedWorkspaces({ changedPaths: [".dockerignore"] });
		const apiDeployment = resolveAffectedWorkspaces({
			changedPaths: [".github/actions/deploy-cloudflare-api-worker/action.yml"],
		});
		const webhooksDeployment = resolveAffectedWorkspaces({
			changedPaths: [".github/actions/deploy-cloudflare-webhooks-worker/action.yml"],
		});
		const geosearchDeployment = resolveAffectedWorkspaces({
			changedPaths: [".github/actions/deploy-cloudflare-geosearch-worker/action.yml"],
		});

		expect(apiContainer.validationWorkspaces).toEqual(["@cataqui/api"]);
		expect(apiContainer.deploy).toMatchObject({ api: true, webhooks: false, geosearch: false });
		expect(apiDeployment.deploy).toMatchObject({ api: true, webhooks: false, geosearch: false });
		expect(webhooksDeployment.deploy).toMatchObject({ api: false, webhooks: true, geosearch: false });
		expect(geosearchDeployment.deploy).toMatchObject({ api: false, webhooks: false, geosearch: true });
	});

	it("validates skills, documentation, and tests without deploying runtime workspaces", () => {
		const result = resolveAffectedWorkspaces({
			changedPaths: [
				"AGENTS.md",
				"skills-lock.json",
				".agents/skills/hono/SKILL.md",
				"apps/workers/webhooks/src/app.spec.ts",
				"packages/api-internal-ingress/src/queue.spec.ts",
			],
		});

		expect(result.validate.repository).toBe(true);
		expect(result.validationWorkspaces).toEqual(["@cataqui/api-internal-ingress", "@cataqui/webhooks-worker"]);
		expect(result.deploy).toMatchObject({ api: false, webhooks: false, geosearch: false });
		expect(result.deployInfrastructure).toBe(false);
	});

	it.each([
		["api", ["@cataqui/api"]],
		["webhooks", ["@cataqui/webhooks-worker"]],
		["geosearch", ["@cataqui/geosearch-worker"]],
	])("maps the %s manual target", (manualTarget, validationWorkspaces) => {
		const result = resolveAffectedWorkspaces({ manualTarget });

		expect(result.mode).toBe("manual");
		expect(result.validationWorkspaces).toEqual(validationWorkspaces);
		expect(result.deploy[manualTarget]).toBe(true);
	});

	it("maps the infrastructure and all manual targets", () => {
		const infrastructure = resolveAffectedWorkspaces({ manualTarget: "infrastructure" });
		const all = resolveAffectedWorkspaces({ manualTarget: "all" });

		expect(infrastructure.infrastructureComponents).toEqual(["aiGateway", "queues", "neon", "upstash"]);
		expect(infrastructure.deploy.api).toBe(true);
		expect(infrastructure.deploy.webhooks).toBe(false);
		expect(all.validationWorkspaces).toHaveLength(5);
		expect(all.deploy).toMatchObject({ api: true, webhooks: true, geosearch: true });
	});

	it("rejects unsupported manual targets", () => {
		expect(() => resolveAffectedWorkspaces({ manualTarget: "workers" })).toThrow('Unsupported manual target "workers"');
	});

	it("formats stable booleans and JSON arrays for GitHub outputs", () => {
		const result = resolveAffectedWorkspaces({
			changedPaths: ["packages/api-internal-ingress/src/index.ts"],
		});

		expect(formatGithubOutputs(result).split("\n")).toEqual(
			expect.arrayContaining([
				"validate_api_internal_ingress=true",
				"validate_api=true",
				"deploy_api=true",
				"deploy_webhooks=true",
				"deploy_geosearch=false",
				'validation_workspaces=["@cataqui/api-internal-ingress","@cataqui/api","@cataqui/webhooks-worker"]',
			]),
		);
	});
});
