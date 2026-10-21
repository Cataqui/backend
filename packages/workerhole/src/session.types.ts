import type { RpcStub } from "capnweb";
import type { Dispatcher } from "./dispatcher";

export interface Session {
	readonly remote: RpcStub<Dispatcher>;
	acquire?(): () => void;
	close(): Promise<void>;
}
