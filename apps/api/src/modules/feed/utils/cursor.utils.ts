import { InvalidCursorError } from "../errors/invalid-cursor.error";
import { type FeedPaginationCursor, FeedPaginationCursorSchema } from "../schemas/feed-pagination-cursor.schema";

const CURSOR_VERSION = 1;

function encodeCursor(params: Omit<FeedPaginationCursor, "version">): string {
	const payload: FeedPaginationCursor = {
		version: CURSOR_VERSION,
		createdAt: params.createdAt,
		jobId: params.jobId,
	};

	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(params: { cursor: string }): FeedPaginationCursor {
	const decoded: string = Buffer.from(params.cursor, "base64url").toString("utf-8");
	let payload: unknown;
	try {
		payload = JSON.parse(decoded);
	} catch {
		throw new InvalidCursorError("Cursor payload is not valid JSON.");
	}

	const parsedCursor = FeedPaginationCursorSchema.safeParse(payload);

	if (!parsedCursor.success) {
		throw new InvalidCursorError("Cursor is missing required fields or has invalid types.");
	}

	if (parsedCursor.data.version !== CURSOR_VERSION) {
		throw new InvalidCursorError(
			`Cursor version '${String(parsedCursor.data.version)}' is not supported. Please use ${CURSOR_VERSION}.`,
		);
	}

	return parsedCursor.data;
}

export const CursorUtils = {
	encodeCursor,
	decodeCursor,
} as const;
