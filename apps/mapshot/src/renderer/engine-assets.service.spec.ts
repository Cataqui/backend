import { fileURLToPath } from "node:url";
import { PlaceCategory } from "@cataqui/places";
import { LandmarkCategories } from "../landmark/landmark-categories";
import { EngineAssetsService } from "./engine-assets.service";

it("exposes the bundled font directory and supported badge geometry without reading assets", () => {
	const service = new EngineAssetsService();
	expect(service.fontRoot).toBe(fileURLToPath(new URL("./assets/fonts", import.meta.url)));
	expect([...service.badges.keys()]).toEqual([...LandmarkCategories]);
	expect(service.badges.get(PlaceCategory.TRAIN_STATION)).toEqual({
		path: fileURLToPath(new URL("./assets/landmarks/TRAIN_STATION.png", import.meta.url)),
		logicalSize: 24,
	});
	expect(service.badges.has(PlaceCategory.CAFE)).toBe(false);
});
