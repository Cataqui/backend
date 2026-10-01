import { createTestBindings, Jpeg } from "../../test/fakes";
import { ImageRepository } from "./image.repository";

it("sanitizes R2 write exceptions at the image repository boundary", async () => {
	const bindings = createTestBindings();
	bindings.put.mockRejectedValue(new Error("private storage credentials"));
	await expect(
		new ImageRepository({ bucket: bindings.env.IMAGES }).saveStoredImage({
			key: "image",
			bytes: Jpeg,
		}),
	).rejects.toMatchObject({ errorCode: "STORAGE_UNAVAILABLE" });
});
