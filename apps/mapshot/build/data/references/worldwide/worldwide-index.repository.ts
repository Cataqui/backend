import {
	closeSync,
	createReadStream,
	existsSync,
	mkdirSync,
	openSync,
	readSync,
	renameSync,
	statSync,
	writeSync,
} from "node:fs";
import {
	DatabaseSync,
	type SQLInputValue,
	type SQLOutputValue,
	type StatementResultingChanges,
	type StatementSync,
} from "node:sqlite";

export class WorldwideIndexRepository {
	readonly close = closeSync;
	readonly readStream = createReadStream;
	readonly exists = existsSync;
	readonly open = openSync;
	readonly read = readSync;
	readonly rename = renameSync;
	readonly stat = statSync;
	readonly write = writeSync;

	mkdir(path: string): void {
		mkdirSync(path, { recursive: true });
	}

	openDatabase(path: string): WorldwideIndexDatabaseRepository {
		return new WorldwideIndexDatabaseRepository(new DatabaseSync(path));
	}
}

export class WorldwideIndexDatabaseRepository {
	private readonly _database: DatabaseSync;

	constructor(database: DatabaseSync) {
		this._database = database;
	}

	exec(sql: string): void {
		this._database.exec(sql);
	}

	prepare(sql: string): WorldwideIndexStatementRepository {
		return new WorldwideIndexStatementRepository(this._database.prepare(sql));
	}

	close(): void {
		this._database.close();
	}
}

export class WorldwideIndexStatementRepository {
	private readonly _statement: StatementSync;

	constructor(statement: StatementSync) {
		this._statement = statement;
	}

	get(...values: SQLInputValue[]): Record<string, SQLOutputValue> | undefined {
		return this._statement.get(...values);
	}

	iterate(...values: SQLInputValue[]): NodeJS.Iterator<Record<string, SQLOutputValue>> {
		return this._statement.iterate(...values);
	}

	run(...values: SQLInputValue[]): StatementResultingChanges {
		return this._statement.run(...values);
	}
}
