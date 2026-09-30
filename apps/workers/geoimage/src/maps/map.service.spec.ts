import { Jpeg } from "../../test/fakes";
import { MapRepository } from "./map.repository";
import { MapService } from "./map.service";

it("generates complete map image bytes from map parameters without storage or location input", async () => {
	const repository = new MapRepository({ config: { apiKey: "test-key" } });
	const image = vi.spyOn(repository, "image").mockResolvedValue(new Response(Jpeg).body!);
	const params = { center: { latitude: 0, longitude: 0 }, size: { width: 512, height: 256 }, density: 1 } as const;
	try {
		const service = new MapService({ repository: () => repository });
		expect(await service.generateImage(params)).toEqual(Jpeg);
		expect(image).toHaveBeenCalledExactlyOnceWith(params);
	} finally {
		vi.restoreAllMocks();
	}
});
