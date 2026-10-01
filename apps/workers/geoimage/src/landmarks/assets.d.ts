// Wrangler bundles WebAssembly imports as compiled modules and font files as binary data (see the Data rule).
declare module "*.wasm" {
	const module: WebAssembly.Module;
	export default module;
}

declare module "*.ttf" {
	const data: ArrayBuffer;
	export default data;
}
