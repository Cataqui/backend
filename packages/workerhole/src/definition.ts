import type { Contract } from "./connection.types";
import type { Channel } from "./types";

const _handlers: unique symbol = Symbol("portal-handlers");
const _side: unique symbol = Symbol("portal-side");

export interface DefinitionShape {
	readonly [_handlers]: object;
	readonly [_side]: "worker" | "container";
}

export type Handlers<Definition extends DefinitionShape> = Definition[typeof _handlers];

export type Definition<Api extends object, Side extends "worker" | "container"> = (abstract new () => Channel<Api>) & {
	readonly [_handlers]: Api;
	readonly [_side]: Side;
};

function _define<Api extends object, Side extends "worker" | "container">(): Definition<Api, Side> {
	abstract class Portal {}
	// The abstract token carries type-only handler and direction brands; clients come from the transport.
	return Portal as Definition<Api, Side>;
}

export function defineWorkerPortal<Api extends Contract<Api>>(): Definition<Api, "worker"> {
	return _define<Api, "worker">();
}

export function defineWorkerContainerPortal<Api extends Contract<Api>>(): Definition<Api, "container"> {
	return _define<Api, "container">();
}
