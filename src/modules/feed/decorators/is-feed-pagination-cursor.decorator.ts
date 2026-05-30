import { registerDecorator, type ValidationOptions } from "class-validator";
import { FeedPaginationCursorSchema } from "../interfaces/feed-pagination-cursor.interface";

export function IsIFeedPaginationCursor(validationOptions: ValidationOptions = {}): PropertyDecorator {
	return function (object: object, propertyKey: string | symbol): void {
		registerDecorator({
			name: "IsIFeedPaginationCursor",
			target: object.constructor,
			propertyName: propertyKey as string,
			options: validationOptions,
			validator: {
				validate(value: unknown): boolean {
					if (typeof value !== "string") return false;

					let decoded: string;

					try {
						decoded = Buffer.from(value, "base64url").toString("utf-8");
					} catch {
						return false;
					}

					let payload: unknown;

					try {
						payload = JSON.parse(decoded);
					} catch {
						return false;
					}

					return FeedPaginationCursorSchema.safeParse(payload).success;
				},
				defaultMessage(): string {
					return "The cursor must be a valid encoded feed pagination cursor";
				},
			},
		});
	};
}
