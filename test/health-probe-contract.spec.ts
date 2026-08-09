import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("API container health probes", () => {
	it("should use process liveness for Docker image and Compose health checks", () => {
		const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");
		const dockerCompose = readFileSync(resolve(process.cwd(), "docker-compose.yml"), "utf8");

		expect({
			dockerfile: dockerfile.includes("http://localhost:3000/v1/health/live"),
			dockerCompose: dockerCompose.includes("http://localhost:3000/v1/health/live"),
		}).toEqual({ dockerfile: true, dockerCompose: true });
	});
});
