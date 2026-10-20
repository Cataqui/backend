import { fileURLToPath } from "node:url";
import type { PlaceCategory } from "@cataqui/places";
import { injectable } from "tsyringe";
import { LandmarkCategories } from "../landmark/landmark-categories";
import { LandmarkStyle } from "../landmark/landmark-style";

@injectable()
export class EngineAssetsService {
	readonly fontRoot = fileURLToPath(new URL("./assets/fonts", import.meta.url));
	readonly badges = new Map<PlaceCategory, { path: string; logicalSize: number }>();

	constructor() {
		const logicalSize = Math.ceil(LandmarkStyle.badgeRadius + LandmarkStyle.badgeStrokeWidth + 2) * 2;
		for (const category of LandmarkCategories) {
			this.badges.set(category, {
				path: fileURLToPath(new URL(`./assets/landmarks/${category}.png`, import.meta.url)),
				logicalSize: logicalSize,
			});
		}
	}
}
