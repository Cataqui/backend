import type { PlaceCategory } from "../../places/place-category";
import type { LandmarkLabelPosition } from "./landmark-label-position.enum";

/** A selected place and its label position in logical map pixels. */
export interface Landmark {
	label: string;
	category: PlaceCategory;
	x: number;
	y: number;
	labelPosition: LandmarkLabelPosition;
}
