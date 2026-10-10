// Wrangler bundles WebAssembly imports throughout the Maps Worker as compiled modules.
declare module "*.wasm" {
	const module: WebAssembly.Module;
	export default module;
}
