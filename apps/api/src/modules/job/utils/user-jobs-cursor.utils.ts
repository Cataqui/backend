import { InvalidCursorError } from "../../../core/errors/invalid-cursor.error";
import { type UserJobsCursor, UserJobsCursorSchema } from "../schemas/user-jobs-cursor.schema";

export function encodeUserJobsCursor(params: { createdAt: string; jobId: string }): string {
	return Buffer.from(JSON.stringify({ version: 1, createdAt: params.createdAt, jobId: params.jobId })).toString(
		"base64url",
	);
}

export function decodeUserJobsCursor(params: { cursor: string }): UserJobsCursor {
	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(params.cursor, "base64url").toString("utf-8"));
	} catch {
		throw new InvalidCursorError();
	}
	const parsed = UserJobsCursorSchema.safeParse(value);
	if (!parsed.success) throw new InvalidCursorError();
	return parsed.data;
}
