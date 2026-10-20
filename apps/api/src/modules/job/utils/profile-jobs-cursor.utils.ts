import { InvalidCursorError } from "../../../core/errors/invalid-cursor.error";
import { type ProfileJobsCursor, ProfileJobsCursorSchema } from "../schemas/profile-jobs-cursor.schema";

export function encodeProfileJobsCursor(params: { createdAt: string; jobId: string }): string {
	return Buffer.from(JSON.stringify({ version: 1, createdAt: params.createdAt, jobId: params.jobId })).toString(
		"base64url",
	);
}

export function decodeProfileJobsCursor(params: { cursor: string }): ProfileJobsCursor {
	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(params.cursor, "base64url").toString("utf-8"));
	} catch {
		throw new InvalidCursorError();
	}
	const parsed = ProfileJobsCursorSchema.safeParse(value);
	if (!parsed.success) throw new InvalidCursorError();
	return parsed.data;
}
