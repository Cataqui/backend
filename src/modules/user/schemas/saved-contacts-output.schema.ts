import { z } from "zod";
import { SavedContactOutputSchema } from "./saved-contact-output.schema";

export const SavedContactsOutputSchema = z.array(SavedContactOutputSchema).meta({ id: "SavedContactsOutput" });
