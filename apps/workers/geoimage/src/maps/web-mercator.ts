// Web Mercator projection in logical pixels, matching the 256-pixel tiles the static map is rendered from.

function _worldSize(zoom: number): number {
	return 256 * 2 ** zoom;
}

function _projectX(params: { longitude: number; zoom: number }): number {
	return ((params.longitude + 180) / 360) * _worldSize(params.zoom);
}

function _projectY(params: { latitude: number; zoom: number }): number {
	const sine = Math.sin((params.latitude * Math.PI) / 180);
	return (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * _worldSize(params.zoom);
}

export function getMapPixel(params: {
	coordinates: { latitude: number; longitude: number };
	center: { latitude: number; longitude: number };
	size: { width: number; height: number };
	zoom: number;
}): { x: number; y: number } {
	return {
		x:
			params.size.width / 2 +
			_projectX({ longitude: params.coordinates.longitude, zoom: params.zoom }) -
			_projectX({ longitude: params.center.longitude, zoom: params.zoom }),
		y:
			params.size.height / 2 +
			_projectY({ latitude: params.coordinates.latitude, zoom: params.zoom }) -
			_projectY({ latitude: params.center.latitude, zoom: params.zoom }),
	};
}

export function getMapCoordinates(params: {
	pixel: { x: number; y: number };
	center: { latitude: number; longitude: number };
	size: { width: number; height: number };
	zoom: number;
}): { latitude: number; longitude: number } {
	const worldSize = _worldSize(params.zoom);
	const x =
		_projectX({ longitude: params.center.longitude, zoom: params.zoom }) + params.pixel.x - params.size.width / 2;
	const y =
		_projectY({ latitude: params.center.latitude, zoom: params.zoom }) + params.pixel.y - params.size.height / 2;
	return {
		latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize))) * 180) / Math.PI,
		longitude: (x / worldSize) * 360 - 180,
	};
}
