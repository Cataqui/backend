import { GUARDS_METADATA, HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ContactController } from "./contact.controller";
import type { ContactService } from "./contact.service";

describe("ContactController", () => {
	const service = { getContact: vi.fn() };
	const controller = new ContactController(service as unknown as ContactService);

	it("exposes public contact lookup by ID and prevents caching", async () => {
		service.getContact.mockResolvedValue({ contactMethod: "WHATSAPP", identifier: "@cataqui.poster" });
		const contactId = "550e8400-e29b-41d4-a716-446655440000";
		await controller.getContact({ contactId: contactId });
		expect(Reflect.getMetadata(PATH_METADATA, ContactController)).toBe("contacts");
		expect(Reflect.getMetadata(PATH_METADATA, controller.getContact)).toBe(":contactId");
		expect(Reflect.getMetadata(GUARDS_METADATA, controller.getContact)).toBeUndefined();
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.getContact)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
		expect(service.getContact).toHaveBeenCalledWith({ contactId: contactId });
	});
});
