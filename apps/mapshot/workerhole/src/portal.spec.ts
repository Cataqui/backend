import { expect, it } from "vitest";
import { ContainerConfig, MapshotWorkerContainerPortal, MapshotWorkerPortal } from "./index";

it("defines both endpoints and the container port safely when imported by Node", () => {
	expect(typeof MapshotWorkerContainerPortal).toBe("function");
	expect(typeof MapshotWorkerPortal).toBe("function");
	expect(ContainerConfig.port).toBe(8080);
});
