import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../../shared/errors/domain-error";
import { ErrorCode } from "../../../shared/errors/error-code.enum";
import type { FeedSort } from "../enums/feed-sort.enum";

export class InvalidCursorError extends DomainError {
	constructor(message?: string) {
		super(ErrorCode.INVALID_CURSOR, message ?? "The provided cursor is invalid or malformed.", HttpStatus.BAD_REQUEST);
	}

	static sortMismatch(cursorSort: string, requestSort: FeedSort): InvalidCursorError {
		return new InvalidCursorError(`Cursor sort '${cursorSort}' does not match requested sort '${requestSort}'.`);
	}
}
