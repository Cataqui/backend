import { resolve } from "node:path";
import ts from "typescript";

it("infers Mapshot RPC calls across Worker contexts without declaration builds", () => {
	const root = resolve(import.meta.dirname, "..");
	const configuration = ts.getParsedCommandLineOfConfigFile(
		resolve(root, "tsconfig.json"),
		{},
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic): never => {
				throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
			},
		},
	);
	if (configuration === undefined) throw new Error("Maps TypeScript configuration could not be loaded.");
	const fixture = resolve(root, "test/worker-binding.typecheck.ts");
	const source = `
    import type { MapsWorkerEnv } from "../cloudflare.config.ts";
    declare const env: MapsWorkerEnv;
    const output = await env.MAPSHOT.render({
      center: { latitude: -23.55, longitude: -46.63 },
      zoom: 13,
      size: { width: 480, height: 480 },
    });
    const bytes: ReadableStream<Uint8Array> = output.bytes;
    const width: number = output.width;
    // @ts-expect-error Unpublished RPC methods are not available.
    env.MAPSHOT.doesNotExist();
    // @ts-expect-error Render input must match the target's declared signature.
    env.MAPSHOT.render(123);
    // @ts-expect-error Output dimensions are numeric.
    const invalidWidth: string = output.width;
  `;
	const host = ts.createCompilerHost(configuration.options);
	const readFile = host.readFile.bind(host);
	host.readFile = (file: string): string | undefined => (file === fixture ? source : readFile(file));
	const program = ts.createProgram({
		rootNames: [...configuration.fileNames.filter((file) => file.endsWith(".d.ts")), fixture],
		options: configuration.options,
		host: host,
	});
	expect(
		ts
			.getPreEmitDiagnostics(program)
			.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
	).toEqual([]);
});
