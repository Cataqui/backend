import { describe, expect, it } from "vitest";
import { ApiWorkerContainerPortal, ApiWorkerPortal } from "./index";

describe("API bridge definitions", () => {
	it("defines both endpoints safely when imported by Node", () => {
		expect(typeof ApiWorkerContainerPortal).toBe("function");
		expect(typeof ApiWorkerPortal).toBe("function");
	});
});
