import {
	isEnum,
	registerDecorator,
	type ValidationArguments,
	type ValidationOptions,
	ValidatorConstraint,
	type ValidatorConstraintInterface,
} from "class-validator";
import { JobPaymentType } from "../../../../generated/prisma/client.js";
import type { JobPaymentInputDto } from "../../job/dto/job-payment-input.dto.js";

function _validateJobPayment(payment: JobPaymentInputDto): {
	isValid: boolean;
	message: string;
} {
	if (!payment) return { isValid: false, message: "payment is required" };

	if (!payment.type || !isEnum(payment.type, JobPaymentType)) {
		return {
			isValid: false,
			message: `type must be one of ${Object.values(JobPaymentType).join(", ")}`,
		};
	}

	if (payment === null || payment === undefined || typeof payment !== "object") {
		return { isValid: false, message: "Invalid payment format" };
	}

	switch (payment.type) {
		case JobPaymentType.FIXED: {
			if (!payment.minAmount) return { isValid: false, message: "Fixed payment requires a minimum amount" };
			if (payment.maxAmount) return { isValid: false, message: "Fixed payment must not have a maximum amount" };
			return { isValid: true, message: "" };
		}

		case JobPaymentType.RANGE: {
			if (!payment.minAmount) return { isValid: false, message: "Range payment requires a minimum and maximum amount" };
			if (!payment.maxAmount) return { isValid: false, message: "Range payment requires a minimum and maximum amount" };
			if (payment.maxAmount <= payment.minAmount)
				return { isValid: false, message: "Maximum amount must be greater than the minimum amount" };
			return { isValid: true, message: "" };
		}

		case JobPaymentType.FLEXIBLE: {
			if (payment.minAmount) return { isValid: false, message: "Flexible payment must not have amount values" };
			if (payment.maxAmount) return { isValid: false, message: "Flexible payment must not have amount values" };
			return { isValid: true, message: "" };
		}

		case JobPaymentType.OTHER: {
			if (payment.minAmount) return { isValid: false, message: "Other payment type must not have amount values" };
			if (payment.maxAmount) return { isValid: false, message: "Other payment type must not have amount values" };
			if (!payment.note || payment.note.trim().length === 0) {
				return { isValid: false, message: "Other payment type requires a note explaining the payment" };
			}

			return { isValid: true, message: "" };
		}
	}
}

@ValidatorConstraint({ name: "isValidJobPayment", async: false })
export class IsValidJobPaymentConstraint implements ValidatorConstraintInterface {
	validate(value: unknown): boolean {
		return _validateJobPayment(value as JobPaymentInputDto).isValid;
	}

	defaultMessage(args: ValidationArguments): string {
		return _validateJobPayment(args.value as JobPaymentInputDto).message;
	}
}

export function IsValidJobPayment(validationOptions?: ValidationOptions): PropertyDecorator {
	return (object: object, propertyName: string | symbol): void => {
		registerDecorator({
			name: "isValidJobPayment",
			target: object.constructor,
			propertyName: propertyName as string,
			options: validationOptions ?? {},
			constraints: [],
			validator: IsValidJobPaymentConstraint,
		});
	};
}
