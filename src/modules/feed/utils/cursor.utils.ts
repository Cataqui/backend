import type { FeedSort } from "../enums/feed-sort.enum";
import { InvalidCursorError } from "../errors/invalid-cursor.error";
import { FeedPaginationCursorSchema, type IFeedPaginationCursor } from "../interfaces/feed-pagination-cursor.interface";

const CURSOR_VERSION = 1;

function encodeCursor(params: Omit<IFeedPaginationCursor, "version">): string {
	const payload: IFeedPaginationCursor = {
		version: CURSOR_VERSION,
		sort: params.sort,
		createdAt: params.createdAt,
		jobId: params.jobId,
	};

	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor: string, expectedSort: FeedSort): IFeedPaginationCursor {
	const decoded: string = Buffer.from(cursor, "base64url").toString("utf-8");
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

	if (parsedCursor.data.sort !== String(expectedSort))
		throw InvalidCursorError.sortMismatch(parsedCursor.data.sort, expectedSort);

	return parsedCursor.data;
}

export const CursorUtils = {
	encodeCursor,
	decodeCursor,
} as const;
