import type { ValidationError } from "class-validator";
import { StringUtils } from "../../shared/utils/string.utils";

function _formatSingleError(error: ValidationError, parentPath?: string): string[] {
	const messages: string[] = [];
	const snakeCaseProperty = StringUtils.camelToSnake(error.property);
	const propertyPath = parentPath ? `${parentPath}.${snakeCaseProperty}` : snakeCaseProperty;

	if (error.constraints) {
		for (const constraintMessage of Object.values(error.constraints)) {
			if (constraintMessage.startsWith(error.property)) {
				messages.push(constraintMessage.replace(error.property, propertyPath));
			} else {
				messages.push(`${propertyPath}: ${constraintMessage}`);
			}
		}
	}

	if (error.children?.length) {
		for (const child of error.children) {
			messages.push(..._formatSingleError(child, propertyPath));
		}
	}

	return messages;
}

function formatValidationErrors(errors: ValidationError[]): string[] {
	return errors.flatMap((error) => _formatSingleError(error));
}

export const ValidationErrorUtils = {
	formatValidationErrors,
} as const;
