import { closeSync, mkdirSync, openSync, rmSync, writeSync } from "node:fs";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue, type StatementSync } from "node:sqlite";

export class WorldwidePlanRepository {
	createDirectory(params: { path: string }): string | undefined {
		return mkdirSync(params.path, { recursive: true });
	}
	removeFile(params: { path: string }): void {
		rmSync(params.path, { force: true });
	}
	openDatabase(params: { path: string }): DatabaseSync {
		return new DatabaseSync(params.path);
	}
	closeDatabase(params: { database: DatabaseSync }): void {
		params.database.close();
	}
	execute(params: { database: DatabaseSync; sql: string }): void {
		params.database.exec(params.sql);
	}
	prepare(params: { database: DatabaseSync; sql: string }): StatementSync {
		return params.database.prepare(params.sql);
	}
	run(params: { statement: StatementSync; values: SQLInputValue[] }): ReturnType<StatementSync["run"]> {
		return params.statement.run(...params.values);
	}
	get<Row extends Record<string, SQLOutputValue>>(params: {
		statement: StatementSync;
		values: SQLInputValue[];
	}): Row | undefined {
		return params.statement.get(...params.values) as Row | undefined;
	}
	iterate<Row extends Record<string, SQLOutputValue> | SQLOutputValue[]>(params: {
		statement: StatementSync;
	}): NodeJS.Iterator<Row> {
		return params.statement.iterate() as unknown as NodeJS.Iterator<Row>;
	}
	setReturnArrays(params: { statement: StatementSync }): void {
		params.statement.setReturnArrays(true);
	}
	createFile(params: { path: string }): number {
		return openSync(params.path, "wx");
	}
	writeFile(params: { descriptor: number; buffer: Uint8Array; offset: number; length: number }): number {
		return writeSync(params.descriptor, params.buffer, params.offset, params.length);
	}
	closeFile(params: { descriptor: number }): void {
		closeSync(params.descriptor);
	}
}
