export interface EngineMapRenderInput {
	camera: {
		latitude: number;
		longitude: number;
		zoom: number;
		width: number;
		height: number;
		pixelRatio: number;
	};
	tiles: {
		key: string;
		address: { z: number; x: number; y: number };
		worldOffset?: number;
		bytes: string;
	}[];
	landmarks: {
		candidates: {
			id: string;
			labels: { text: string; wordEnds: number[]; graphemeEnds: number[] }[];
			coordinates: { latitude: number; longitude: number };
			badge: { path: string; logicalSize: number };
			textColor: string;
			rank: number;
			sourceMinZoom: number | null;
		}[];
		style: {
			badgeRadius: number;
			badgeStrokeWidth: number;
			labelGap: number;
			edgeMargin: number;
			labelFontSize: number;
			labelMaxWidth: number;
			labelMaxLines: number;
			labelLineHeight: number;
			labelLetterSpacing: number;
			labelHaloWidth: number;
		};
	};
}
