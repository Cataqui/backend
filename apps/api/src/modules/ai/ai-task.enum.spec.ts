import { AiTask } from "./ai-task.enum";

describe("AiTask", () => {
	it("should expose job data derivation as an AI task", () => {
		expect(AiTask.DERIVE_JOB_DATA).toBe("DERIVE_JOB_DATA");
	});
});
