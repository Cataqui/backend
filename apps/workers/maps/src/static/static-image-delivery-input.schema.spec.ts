import { StaticImageDeliveryInputSchema } from "./static-image-delivery-input.schema";
it("accepts an opaque URL-safe reference", () => {
	expect(StaticImageDeliveryInputSchema.parse({ image: "opaque_reference-123.webp" })).toEqual({
		reference: "opaque_reference-123",
	});
});
it.each(["", "v1.payload.signature", "payload=", "a".repeat(4097) + ".webp"])(
	"rejects malformed reference %s",
	(reference) => {
		expect(StaticImageDeliveryInputSchema.safeParse({ image: reference }).success).toBe(false);
	},
);
