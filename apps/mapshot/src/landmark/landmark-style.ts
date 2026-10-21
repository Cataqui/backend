import { MateoDefaultPalette } from "@mateo/palette";
// Logical-pixel geometry shared by pin placement and drawing, so collision checks match what is rendered.
export const LandmarkStyle = {
	labelLineHeight: 10,
	labelMaxWidth: 80,
	labelMaxLines: 3,
	badgeRadius: 8,
	badgeStrokeWidth: 1.25,
	// Mateo draws category icons at 65% of their circular background.
	iconScale: 0.65,
	iconColor: MateoDefaultPalette.neutral[1],
	labelFontSize: 8,
	// Mateo's fixed letter spacing in logical pixels, independent of font size.
	labelLetterSpacing: -0.2,
	labelHaloWidth: 2,
	labelGap: 3,
	// Keeps pins and labels away from the image edges.
	edgeMargin: 6,
} as const;
