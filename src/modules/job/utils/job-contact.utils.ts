import { plainToInstance } from "class-transformer";
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactConstants } from "../constants/job-contact.constants.js";
import type { ContactDetailsInputDto } from "../types/job-contact.types.js";

function buildDetailsOutputDto(method: JobContactMethod, identifier: string) {
	return JobContactConstants.CONTACT_DETAILS_OUTPUT_DTO_BUILDER_BY_METHOD[method](identifier);
}

function instantiateDetailsInput(obj: Record<string, unknown>): ContactDetailsInputDto | Record<string, never> {
	const method = (obj["contact_method"] ?? obj["contactMethod"]) as JobContactMethod | undefined;
	const rawDetails = obj["contact_details"] ?? obj["contactDetails"];

	if (!rawDetails || typeof rawDetails !== "object" || Array.isArray(rawDetails)) return {};

	const details = rawDetails as Record<string, unknown>;

	const DtoClass = method !== undefined ? JobContactConstants.CONTACT_DETAILS_INPUT_DTO_BY_METHOD[method] : undefined;

	if (!DtoClass) return {};

	return plainToInstance(DtoClass, details);
}

export const JobContactUtils = {
	buildDetailsOutputDto,
	instantiateDetailsInput,
} as const;
