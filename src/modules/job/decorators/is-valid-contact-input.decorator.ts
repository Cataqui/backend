import {
	isEnum,
	isPhoneNumber,
	isString,
	registerDecorator,
	type ValidationArguments,
	type ValidationOptions,
	ValidatorConstraint,
	type ValidatorConstraintInterface,
} from "class-validator";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import type { JobContactInputDto } from "../dto/job-contact-input.dto.js";

const _CONTACT_IDENTIFIER_VALIDATORS = {
	[JobContactMethod.WHATSAPP]: (identifier: string) => _validatePhoneNumber(JobContactMethod.WHATSAPP, identifier),
	[JobContactMethod.PHONE_CALL]: (identifier: string) => _validatePhoneNumber(JobContactMethod.PHONE_CALL, identifier),
} as const satisfies Record<JobContactMethod, (identifier: string) => { isValid: boolean; message: string }>;

function _validatePhoneNumber(method: JobContactMethod, identifier: string): { isValid: boolean; message: string } {
	if (!isPhoneNumber(identifier)) {
		return {
			isValid: false,
			message: `identifier for the contact method ${method} must be a phone number with country code, starting with + followed by the country and local number. Example: +5511999999999`,
		};
	}

	return { isValid: true, message: "" };
}

function validateContactInput(contact: JobContactInputDto): {
	isValid: boolean;
	message: string;
} {
	if (!contact) return { isValid: false, message: "contact is required" };
	if (!contact.identifier) return { isValid: false, message: "contact identifier is required" };
	if (!isString(contact.identifier)) return { isValid: false, message: "contact identifier must be a string" };

	if (contact.identifier.trim().length === 0) {
		return { isValid: false, message: "contact identifier must not be empty" };
	}

	if (contact.contactMethod === undefined || !isEnum(contact.contactMethod, JobContactMethod)) {
		return {
			isValid: false,
			message: `contact_method must be set to a supported contact method: ${Object.values(JobContactMethod).join(", ")}`,
		};
	}

	const validator = _CONTACT_IDENTIFIER_VALIDATORS[contact.contactMethod];
	return validator(contact.identifier);
}

@ValidatorConstraint({ name: "isValidContactInput", async: false })
export class IsValidContactInputConstraint implements ValidatorConstraintInterface {
	validate(value: unknown): boolean {
		return validateContactInput(value as JobContactInputDto).isValid;
	}

	defaultMessage(args: ValidationArguments): string {
		return validateContactInput(args.value as JobContactInputDto).message;
	}
}

export function IsValidContactInput(validationOptions?: ValidationOptions): PropertyDecorator {
	return (object: object, propertyName: string | symbol): void => {
		registerDecorator({
			name: "isValidContactInput",
			target: object.constructor,
			propertyName: propertyName as string,
			options: validationOptions ?? {},
			constraints: [],
			validator: IsValidContactInputConstraint,
		});
	};
}
