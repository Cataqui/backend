/** biome-ignore-all lint/suspicious/noExplicitAny: constructors for contact details have different param shapes per method */
import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { PhoneCallContactDetailsInputDto } from "../dto/contact-details/phone-call-contact-details-input.dto";
import { PhoneCallContactDetailsOutputDto } from "../dto/contact-details/phone-call-contact-details-output.dto";
import { WhatsappContactDetailsInputDto } from "../dto/contact-details/whatsapp-contact-details-input.dto";
import { WhatsappContactDetailsOutputDto } from "../dto/contact-details/whatsapp-contact-details-output.dto";
import type { IJobContactDetails } from "../interfaces/job-contact-details.interface.js";

const CONTACT_DETAILS_INPUT_DTO_BY_METHOD = {
	[JobContactMethod.WHATSAPP]: WhatsappContactDetailsInputDto,
	[JobContactMethod.PHONE_CALL]: PhoneCallContactDetailsInputDto,
} as const satisfies Record<JobContactMethod, new (...args: any[]) => IJobContactDetails>;

const CONTACT_DETAILS_OUTPUT_DTO_BUILDER_BY_METHOD = {
	[JobContactMethod.WHATSAPP]: (identifier: string) => new WhatsappContactDetailsOutputDto({ phoneNumber: identifier }),
	[JobContactMethod.PHONE_CALL]: (identifier: string) =>
		new PhoneCallContactDetailsOutputDto({ phoneNumber: identifier }),
} as const satisfies Record<JobContactMethod, (identifier: string) => IJobContactDetails>;

export const JobContactConstants = {
	CONTACT_DETAILS_INPUT_DTO_BY_METHOD,
	CONTACT_DETAILS_OUTPUT_DTO_BUILDER_BY_METHOD,
} as const;
