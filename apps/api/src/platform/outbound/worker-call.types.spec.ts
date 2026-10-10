import type { GenerateStaticMapsInputSchema, GenerateStaticMapsResult } from "@cataqui/maps-contracts";
import type { z } from "zod";
import type { WorkerCallInput, WorkerCallParameters, WorkerCallResult } from "./worker-call.types";
import type { WorkerManifest } from "./worker-manifest";

type Registry = {
	maps: {
		host: string;
		methods: {
			generateStaticMaps: (typeof WorkerManifest)["maps"]["methods"]["generateStaticMaps"];
			describe: { input: z.ZodString; result: z.ZodNumber };
		};
	};
	anotherWorker: {
		host: string;
		methods: { describe: { input: z.ZodBoolean; result: z.ZodString } };
	};
};

it("keeps inputs and results correlated across multiple Workers and methods", () => {
	expectTypeOf<WorkerCallInput<Registry, "maps", "generateStaticMaps">>().toEqualTypeOf<
		z.input<typeof GenerateStaticMapsInputSchema>
	>();
	expectTypeOf<WorkerCallResult<Registry, "maps", "generateStaticMaps">>().toEqualTypeOf<GenerateStaticMapsResult>();
	expectTypeOf<WorkerCallInput<Registry, "maps", "describe">>().toEqualTypeOf<string>();
	expectTypeOf<WorkerCallResult<Registry, "maps", "describe">>().toEqualTypeOf<number>();
	expectTypeOf<WorkerCallInput<Registry, "anotherWorker", "describe">>().toEqualTypeOf<boolean>();
	expectTypeOf<WorkerCallResult<Registry, "anotherWorker", "describe">>().toEqualTypeOf<string>();
	expectTypeOf<{ worker: "maps"; method: "describe"; input: boolean }>().not.toExtend<WorkerCallParameters<Registry>>();
	expectTypeOf<{
		worker: "anotherWorker";
		method: "generateStaticMaps";
		input: { latitude: number; longitude: number };
	}>().not.toExtend<WorkerCallParameters<Registry>>();
});
