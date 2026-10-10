import { MateoDefaultPalette } from "@mateo/palette";
// Logical-pixel geometry shared by pin placement and drawing, so collision checks match what is rendered.
export const LandmarkStyle = {
	fontFamily: "Inter",
	badgeRadius: 14,
	badgeStrokeWidth: 2,
	// Mateo draws category icons at 65% of their circular background.
	iconScale: 0.65,
	iconColor: MateoDefaultPalette.neutral[1],
	labelFontSize: 15,
	labelFontWeight: 600,
	// Mateo's fixed letter spacing in logical pixels, independent of font size.
	labelLetterSpacing: -0.2,
	// Average Inter SemiBold advance per font-size unit; labels are measured before the font is available.
	labelCharacterWidth: 0.58,
	labelHaloWidth: 3,
	labelGap: 5,
	labelMaxLength: 26,
	// Keeps pins and labels away from the image edges.
	edgeMargin: 6,
} as const;
