import type { Session } from "./session.types";

export interface Adapter {
	connect(): Promise<Session>;
	close(): Promise<void>;
}
