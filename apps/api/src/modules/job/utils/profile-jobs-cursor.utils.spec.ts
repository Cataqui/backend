import { InvalidCursorError } from "../../../core/errors/invalid-cursor.error";
import { decodeProfileJobsCursor, encodeProfileJobsCursor } from "./profile-jobs-cursor.utils";

describe("posted jobs cursor", () => {
	it("round trips the newest-first job position", () => {
		const position = { createdAt: "2026-09-23T12:00:00.000Z", jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
		expect(decodeProfileJobsCursor({ cursor: encodeProfileJobsCursor(position) })).toEqual({
			version: 1,
			...position,
		});
	});

	it.each([
		"invalid",
		Buffer.from("{").toString("base64url"),
		Buffer.from(JSON.stringify({ version: 2 })).toString("base64url"),
	])("rejects an invalid cursor (%s)", (cursor) => {
		expect(() => decodeProfileJobsCursor({ cursor: cursor })).toThrow(InvalidCursorError);
	});
});
