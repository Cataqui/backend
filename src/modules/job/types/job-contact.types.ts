import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactConstants } from "../constants/job-contact.constants.js";

type ContactDetailsInputDto = InstanceType<
	(typeof JobContactConstants.CONTACT_DETAILS_INPUT_DTO_BY_METHOD)[JobContactMethod]
>;

type ContactDetailsOutputDto = ReturnType<
	(typeof JobContactConstants.CONTACT_DETAILS_OUTPUT_DTO_BUILDER_BY_METHOD)[JobContactMethod]
>;

export type { ContactDetailsInputDto, ContactDetailsOutputDto };
