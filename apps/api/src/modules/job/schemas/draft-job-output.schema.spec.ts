import { JobStatus } from "../../../../generated/prisma/client.js";
import { DraftJobOutputSchema } from "./draft-job-output.schema";

const draftOutput = {
	jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: null,
	description: "Descrição original da oportunidade.",
	descriptionSummary: null,
	contactReference: null,
	location: null,
	payment: null,
	status: JobStatus.DRAFT,
	type: null,
	createdAt: "2026-08-09T12:00:00.000Z",
	updatedAt: "2026-08-09T12:00:00.000Z",
};

describe("DraftJobOutputSchema", () => {
	it("should accept a draft whose publication fields are not supplied yet", () => {
		expect(DraftJobOutputSchema.safeParse(draftOutput).success).toBe(true);
	});

	it("should reject an active job from the draft contract", () => {
		expect(DraftJobOutputSchema.safeParse({ ...draftOutput, status: JobStatus.ACTIVE }).success).toBe(false);
	});
});
