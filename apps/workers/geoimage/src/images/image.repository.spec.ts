import { createTestBindings, Jpeg } from "../../test/fakes";
import { ImageRepository } from "./image.repository";

it("strips request IDs and cookies from cache representations", async () => {
	const bindings = createTestBindings();
	const key = new Request("https://geoimage.test/key");
	await new ImageRepository({ bucket: bindings.env.IMAGES, cache: bindings.cache }).saveCachedImage({
		key: key,
		requestId: "owned",
		response: new Response(Jpeg, {
			headers: { "x-request-id": "private-trace", "Set-Cookie": "private-cookie", "Content-Type": "image/jpeg" },
		}),
	});
	const stored = bindings.cached.get(key.url)!;
	expect(stored.headers.get("x-request-id")).toBeNull();
	expect(stored.headers.get("Set-Cookie")).toBeNull();
	expect(new Uint8Array(await stored.arrayBuffer())).toEqual(Jpeg);
});

it("sanitizes R2 write exceptions at the image repository boundary", async () => {
	const bindings = createTestBindings();
	bindings.put.mockRejectedValue(new Error("private storage credentials"));
	await expect(
		new ImageRepository({ bucket: bindings.env.IMAGES, cache: bindings.cache }).saveStoredImage({
			key: "image",
			bytes: Jpeg,
		}),
	).rejects.toMatchObject({ errorCode: "STORAGE_UNAVAILABLE" });
});
