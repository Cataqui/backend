import { LandmarkCategories } from "./landmark-category";
import { LandmarkLabelPosition, type PlacedLandmark } from "./landmark-selection";
import { LandmarkStyle } from "./landmark-style";
import { MateoIconMarkup } from "./mateo-icons";

export const LandmarkFontFamily = "Inter";

/**
 * Builds an SVG that draws the base map JPEG and every landmark badge with its label. The SVG uses logical
 * pixels in its viewBox and renders at the image's physical size, so pins scale with the requested density.
 */
export function buildLandmarkOverlay(params: {
	baseImage: Uint8Array;
	landmarks: readonly PlacedLandmark[];
	size: { width: number; height: number };
	density: number;
}): string {
	const { width, height } = params.size;
	const radius = LandmarkStyle.badgeRadius;
	const iconSize = radius * 2 * LandmarkStyle.iconScale;
	const gap = radius + LandmarkStyle.badgeStrokeWidth + LandmarkStyle.labelGap;

	const landmarks = params.landmarks.map((landmark, index) => {
		const category = LandmarkCategories[landmark.category];
		// Icon markup may define clip paths; suffixing ids keeps repeated icons from sharing definitions.
		const icon = MateoIconMarkup[category.icon].replace(/(id="|url\(#)([^")]+)/g, `$1$2-${index}`);
		const label = _getLabelPlacement({ landmark: landmark, gap: gap });
		return [
			`<circle cx="${landmark.x}" cy="${landmark.y}" r="${radius}" fill="${category.color}" stroke="#FFFFFF" stroke-width="${LandmarkStyle.badgeStrokeWidth}"/>`,
			`<svg x="${landmark.x - iconSize / 2}" y="${landmark.y - iconSize / 2}" width="${iconSize}" height="${iconSize}" viewBox="0 0 20 20" color="${LandmarkStyle.iconColor}">${icon}</svg>`,
			`<text x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" font-family="${LandmarkFontFamily}" font-size="${LandmarkStyle.labelFontSize}" font-weight="${LandmarkStyle.labelFontWeight}" fill="${category.color}" stroke="#FFFFFF" stroke-width="${LandmarkStyle.labelHaloWidth}" stroke-linejoin="round" paint-order="stroke">${_escapeXml(landmark.label)}</text>`,
		].join("");
	});

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width * params.density}" height="${height * params.density}" viewBox="0 0 ${width} ${height}">`,
		`<image href="data:image/jpeg;base64,${_encodeBase64(params.baseImage)}" width="${width}" height="${height}"/>`,
		...landmarks,
		"</svg>",
	].join("");
}

function _getLabelPlacement(params: { landmark: PlacedLandmark; gap: number }): {
	x: number;
	y: number;
	anchor: "start" | "end" | "middle";
} {
	const { x, y } = params.landmark;
	// Baseline offset that visually centers cap-height text on a point.
	const centered = y + LandmarkStyle.labelFontSize * 0.36;
	switch (params.landmark.labelPosition) {
		case LandmarkLabelPosition.RIGHT:
			return { x: x + params.gap, y: centered, anchor: "start" };
		case LandmarkLabelPosition.LEFT:
			return { x: x - params.gap, y: centered, anchor: "end" };
		case LandmarkLabelPosition.ABOVE:
			return { x: x, y: y - params.gap - LandmarkStyle.labelFontSize * 0.35, anchor: "middle" };
		case LandmarkLabelPosition.BELOW:
			return { x: x, y: y + params.gap + LandmarkStyle.labelFontSize, anchor: "middle" };
	}
}

function _escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}
