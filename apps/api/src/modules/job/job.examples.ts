import type { z } from "zod";
import { ContactMethod, JobStatus } from "../../../generated/prisma/client";
import { PublicJobOutputSchema } from "./schemas/public-job-output.schema";

export const publicJobExample = {
	jobId: "00000000-0000-4000-8000-000000000002",
	title: "Ajudante para evento no sábado",
	description: "Preciso de ajuda para montar mesas no sábado, das 9h às 13h. Pagamento de R$ 120 no dia.",
	descriptionSummary: "Montagem de mesas no sábado, das 9h às 13h. R$ 120 no dia.",
	contactReference: { contactId: "00000000-0000-4000-8000-000000000003", method: ContactMethod.WHATSAPP },
	location: {
		latitude: -23.532,
		longitude: -46.792,
		areaRadius: 300,
		imageUrl: "https://maps.example.com/static/v1/example.webp",
	},
	payment: "R$ 120 no dia",
	status: JobStatus.ACTIVE,
	createdAt: "2026-10-30T12:00:00.000Z",
	updatedAt: "2026-10-30T12:00:00.000Z",
} satisfies z.output<typeof PublicJobOutputSchema>;
