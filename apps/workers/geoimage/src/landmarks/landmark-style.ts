// Logical-pixel geometry shared by pin placement and drawing, so collision checks match what is rendered.
export const LandmarkStyle = {
	badgeRadius: 14,
	badgeStrokeWidth: 2,
	// Mateo draws category icons at 65% of their circular background.
	iconScale: 0.65,
	iconColor: "#FCFCFC",
	labelFontSize: 15,
	labelFontWeight: 600,
	// Average Inter SemiBold advance per font-size unit; labels are measured before the font is available.
	labelCharacterWidth: 0.58,
	labelHaloWidth: 3,
	labelGap: 5,
	labelMaxLength: 26,
	// Keeps pins and labels away from the image edges.
	edgeMargin: 6,
} as const;
