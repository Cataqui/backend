import { instanceToPlain } from "class-transformer";
import { JobContactOutputDto } from "./job-contact-output.dto";

describe("JobContactOutputDto", () => {
	describe("constructor", () => {
		it("should set name and whatsappNumber", () => {
			const dto = new JobContactOutputDto({ contactName: "João Silva", contactWhatsapp: "+5511999999999" });

			expect(dto.name).toBe("João Silva");
			expect(dto.whatsappNumber).toBe("+5511999999999");
		});

		it("should generate whatsappUrl", () => {
			const dto = new JobContactOutputDto({ contactName: "João Silva", contactWhatsapp: "+5511999999999" });

			expect(dto.whatsappUrl).toBe("https://wa.me/5511999999999");
		});

		it("should strip leading + from whatsapp number for URL", () => {
			const dto = new JobContactOutputDto({ contactName: "Maria", contactWhatsapp: "5511999999999" });

			expect(dto.whatsappUrl).toBe("https://wa.me/5511999999999");
		});
	});

	describe("serialization", () => {
		it("should serialize name, whatsapp_number, whatsapp_url as snake_case", () => {
			const dto = new JobContactOutputDto({ contactName: "João Silva", contactWhatsapp: "+5511999999999" });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).toEqual({
				name: "João Silva",
				whatsapp_number: "+5511999999999",
				whatsapp_url: "https://wa.me/5511999999999",
			});
		});

		it("should not expose raw camelCase property names", () => {
			const dto = new JobContactOutputDto({ contactName: "João Silva", contactWhatsapp: "+5511999999999" });
			const plain = instanceToPlain(dto) as Record<string, unknown>;

			expect(plain).not.toHaveProperty("whatsappNumber");
			expect(plain).not.toHaveProperty("whatsappUrl");
		});
	});
});
