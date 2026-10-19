// Throwaway spike: checks what SQLite-backed Durable Objects allow before the
// real ProjectDatabase is built. Every method reports what happened instead of
// throwing, so one call answers one question.
import { DurableObject } from 'cloudflare:workers';

interface Env {
  PROJECT_DATABASE: DurableObjectNamespace<ProjectDatabase>;
  SPIKE_TOKEN: string;
}

type Step = Record<string, unknown>;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export class ProjectDatabase extends DurableObject<Env> {
  private run(query: string, ...bindings: unknown[]): Step {
    const started = performance.now();
    try {
      const cursor = this.ctx.storage.sql.exec(query, ...bindings);
      const rows = cursor.toArray();
      return {
        ok: true,
        rows: rows.length > 20 ? rows.slice(0, 20) : rows,
        rowCount: rows.length,
        rowsRead: cursor.rowsRead,
        rowsWritten: cursor.rowsWritten,
        ms: Math.round(performance.now() - started)
      };
    } catch (error) {
      return {
        ok: false,
        error: errorText(error),
        ms: Math.round(performance.now() - started)
      };
    }
  }

  async ping() {
    let colo: string | undefined;
    try {
      const trace = await (
        await fetch('https://www.cloudflare.com/cdn-cgi/trace')
      ).text();
      colo = /colo=(\w+)/.exec(trace)?.[1];
    } catch (error) {
      colo = `trace failed: ${errorText(error)}`;
    }
    return { colo, now: Date.now(), size: this.ctx.storage.sql.databaseSize };
  }

  echo() {
    return { now: Date.now() };
  }

  reset() {
    return this.ctx.storage.deleteAll().then(() => ({
      size: this.ctx.storage.sql.databaseSize
    }));
  }

  sql(query: string, bindings: unknown[] = []) {
    return this.run(query, ...bindings);
  }

  // SQLite's documented table rebuild: foreign keys off outside the
  // transaction, foreign_key_check before committing, back on after.
  rebuildWithChecksOff(statements: string[]) {
    const off = this.run('PRAGMA foreign_keys = OFF');
    const offRead = this.run('PRAGMA foreign_keys');
    const steps: Step[] = [];
    let result: Step;
    try {
      this.ctx.storage.transactionSync(() => {
        for (const statement of statements) {
          const step = this.run(statement);
          steps.push({ statement: statement.slice(0, 80), ...step });
          if (!step.ok) throw new Error(String(step.error));
        }
        const check = this.run('PRAGMA foreign_key_check');
        steps.push({ statement: 'PRAGMA foreign_key_check', ...check });
        if (check.rowCount) throw new Error('foreign key violations');
      });
      result = { committed: true, steps };
    } catch (error) {
      result = { committed: false, error: errorText(error), steps };
    }
    const violations = this.run('PRAGMA foreign_key_check');
    const on = this.run('PRAGMA foreign_keys = ON');
    const onRead = this.run('PRAGMA foreign_keys');
    return { off, offRead, result, violations, on, onRead };
  }

  // Runs the statements inside one transactionSync; a failed step throws so
  // the transaction rolls back.
  transaction(statements: string[], throwOnError = true) {
    const steps: Step[] = [];
    try {
      this.ctx.storage.transactionSync(() => {
        for (const statement of statements) {
          const step = this.run(statement);
          steps.push({ statement: statement.slice(0, 80), ...step });
          if (!step.ok && throwOnError) throw new Error(String(step.error));
        }
      });
      return { committed: true, steps };
    } catch (error) {
      return { committed: false, error: errorText(error), steps };
    }
  }

  foreignKeys() {
    const out: Step = {};
    out.pragmaDefault = this.run('PRAGMA foreign_keys');
    this.run('DROP TABLE IF EXISTS fk_child');
    this.run('DROP TABLE IF EXISTS fk_parent');
    this.run('CREATE TABLE fk_parent (id INTEGER PRIMARY KEY, name TEXT)');
    this.run(
      'CREATE TABLE fk_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES fk_parent(id) ON DELETE RESTRICT, other_id INTEGER REFERENCES fk_parent(id) ON DELETE CASCADE)'
    );
    this.run("INSERT INTO fk_parent (id, name) VALUES (1, 'a'), (2, 'b')");
    out.orphanInsert = this.run(
      'INSERT INTO fk_child (parent_id) VALUES (999)'
    );
    out.validInsert = this.run(
      'INSERT INTO fk_child (parent_id, other_id) VALUES (1, 2)'
    );
    out.restrictDelete = this.run('DELETE FROM fk_parent WHERE id = 1');
    out.cascadeDelete = this.run('DELETE FROM fk_parent WHERE id = 2');
    out.childrenAfterCascade = this.run('SELECT * FROM fk_child');
    out.setOff = this.run('PRAGMA foreign_keys = OFF');
    out.pragmaAfterOff = this.run('PRAGMA foreign_keys');
    out.orphanWhileOff = this.run(
      'INSERT INTO fk_child (parent_id) VALUES (998)'
    );
    out.setOn = this.run('PRAGMA foreign_keys = ON');
    out.pragmaAfterOn = this.run('PRAGMA foreign_keys');
    out.foreignKeyCheck = this.run('PRAGMA foreign_key_check');
    out.deferInTransaction = (() => {
      try {
        return this.ctx.storage.transactionSync(() => {
          const defer = this.run('PRAGMA defer_foreign_keys = ON');
          const orphan = this.run(
            'INSERT INTO fk_child (parent_id) VALUES (777)'
          );
          const parent = this.run(
            "INSERT INTO fk_parent (id, name) VALUES (777, 'late')"
          );
          return { defer, orphan, parent, committed: true };
        });
      } catch (error) {
        return { committed: false, error: errorText(error) };
      }
    })();
    out.deferredOrphanRollback = (() => {
      try {
        return this.ctx.storage.transactionSync(() => {
          this.run('PRAGMA defer_foreign_keys = ON');
          return this.run('INSERT INTO fk_child (parent_id) VALUES (555)');
        });
      } catch (error) {
        return { committed: false, error: errorText(error) };
      }
    })();
    out.foreignKeyList = this.run("PRAGMA foreign_key_list('fk_child')");
    return out;
  }

  fullTextSearch() {
    const out: Step = {};
    this.run('DROP TABLE IF EXISTS menu__fts');
    this.run('DROP TABLE IF EXISTS menu');
    this.run(
      'CREATE TABLE menu (id INTEGER PRIMARY KEY, name TEXT, description TEXT)'
    );
    out.createFts = this.run(
      "CREATE VIRTUAL TABLE menu__fts USING fts5(name, description, content='menu', content_rowid='id', tokenize='unicode61 remove_diacritics 2')"
    );
    out.triggers = [
      this.run(
        'CREATE TRIGGER menu__fts_ai AFTER INSERT ON menu BEGIN INSERT INTO menu__fts(rowid, name, description) VALUES (new.id, new.name, new.description); END'
      ),
      this.run(
        "CREATE TRIGGER menu__fts_ad AFTER DELETE ON menu BEGIN INSERT INTO menu__fts(menu__fts, rowid, name, description) VALUES ('delete', old.id, old.name, old.description); END"
      ),
      this.run(
        "CREATE TRIGGER menu__fts_au AFTER UPDATE ON menu BEGIN INSERT INTO menu__fts(menu__fts, rowid, name, description) VALUES ('delete', old.id, old.name, old.description); INSERT INTO menu__fts(rowid, name, description) VALUES (new.id, new.name, new.description); END"
      )
    ];
    out.insert = this.run(
      `INSERT INTO menu (name, description) VALUES
        ('Pizza Jalapeño', 'salsa de tomate, jalapeño y queso'),
        ('Margherita', 'tomate, mozzarella y albahaca'),
        ('Hawaiana', 'piña y jamón'),
        ('Picante', 'jalapeño, jalapeño, chorizo y ají')`
    );
    const search = (term: string) =>
      this.run(
        'SELECT m.id, m.name, bm25(menu__fts) AS rank FROM menu__fts JOIN menu m ON m.id = menu__fts.rowid WHERE menu__fts MATCH ? ORDER BY rank',
        term
      );
    out.searchWithoutAccent = search('jalapeno');
    out.searchWithAccent = search('jalapeño');
    out.searchPina = search('pina');
    out.searchPrefix = search('marg*');
    out.update = this.run(
      "UPDATE menu SET description = 'tomate y aceitunas' WHERE name = 'Margherita'"
    );
    out.searchAfterUpdateOld = search('mozzarella');
    out.searchAfterUpdateNew = search('aceitunas');
    out.delete = this.run("DELETE FROM menu WHERE name = 'Hawaiana'");
    out.searchAfterDelete = search('pina');
    out.integrityCheck = this.run(
      "INSERT INTO menu__fts(menu__fts, rank) VALUES ('integrity-check', 1)"
    );
    out.rebuild = this.run("INSERT INTO menu__fts(menu__fts) VALUES ('rebuild')");
    return out;
  }

  pitrWrite(value: string) {
    this.run(
      'CREATE TABLE IF NOT EXISTS pitr (id INTEGER PRIMARY KEY, value TEXT, at INTEGER)'
    );
    this.run('INSERT INTO pitr (value, at) VALUES (?, ?)', value, Date.now());
    return { now: Date.now(), rows: this.pitrRead() };
  }

  pitrRead() {
    try {
      return this.ctx.storage.sql
        .exec('SELECT value FROM pitr ORDER BY id')
        .toArray()
        .map(row => row.value);
    } catch (error) {
      return `read failed: ${errorText(error)}`;
    }
  }

  async currentBookmark() {
    return { bookmark: await this.ctx.storage.getCurrentBookmark() };
  }

  // Schedules the restore and returns the undo bookmark before the object
  // restarts, so the caller learns it even though abort ends the session.
  async restoreToTime(timestamp: number) {
    const bookmark = await this.ctx.storage.getBookmarkForTime(timestamp);
    return this.restoreToBookmark(bookmark);
  }

  async bookmarkForTime(timestamp: number) {
    try {
      return {
        bookmark: await this.ctx.storage.getBookmarkForTime(timestamp)
      };
    } catch (error) {
      return { error: errorText(error) };
    }
  }

  async restoreToBookmark(bookmark: string) {
    const undo = await this.ctx.storage.onNextSessionRestoreBookmark(bookmark);
    setTimeout(() => this.ctx.abort('restore'), 50);
    return { bookmark, undo };
  }

  async deleteAllThenRead() {
    await this.ctx.storage.deleteAll();
    return { size: this.ctx.storage.sql.databaseSize, rows: this.pitrRead() };
  }

  limits() {
    const out: Step = {};
    out.sizeBefore = this.ctx.storage.sql.databaseSize;
    this.run('DROP TABLE IF EXISTS lim');
    this.run('CREATE TABLE lim (id INTEGER PRIMARY KEY, v INTEGER)');
    const values = (n: number) => Array.from({ length: n }, () => '(?)').join(',');
    const numbers = (n: number) => Array.from({ length: n }, (_, i) => i);
    out.insert100Params = this.run(
      `INSERT INTO lim (v) VALUES ${values(100)}`,
      ...numbers(100)
    );
    out.insert101Params = this.run(
      `INSERT INTO lim (v) VALUES ${values(101)}`,
      ...numbers(101)
    );
    out.insert100Literal = this.run(
      `INSERT INTO lim (v) VALUES ${numbers(1000)
        .map(n => `(${n})`)
        .join(',')}`
    );
    out.fullScan = this.run('SELECT count(*) AS n FROM lim WHERE v >= 0');
    out.pointRead = this.run('SELECT * FROM lim WHERE id = 5');
    out.updateAll = this.run('UPDATE lim SET v = v + 1');
    this.run('CREATE INDEX lim_v ON lim(v)');
    out.insertWithIndex = this.run('INSERT INTO lim (v) VALUES (?)', 1);
    out.updateWithIndex = this.run('UPDATE lim SET v = v + 1 WHERE id <= 10');
    out.statement99kb = this.run(`SELECT 1 /* ${'x'.repeat(99_000)} */`);
    out.statement101kb = this.run(`SELECT 1 /* ${'x'.repeat(101_000)} */`);
    out.row1_9mb = this.run(
      'INSERT INTO lim (v) VALUES (?)',
      'y'.repeat(1_900_000)
    );
    out.row2_1mb = this.run(
      'INSERT INTO lim (v) VALUES (?)',
      'y'.repeat(2_100_000)
    );
    out.columns100 = this.run(
      `CREATE TABLE IF NOT EXISTS wide100 (${Array.from(
        { length: 100 },
        (_, i) => `c${i} TEXT`
      ).join(', ')})`
    );
    out.columns101 = this.run(
      `CREATE TABLE IF NOT EXISTS wide101 (${Array.from(
        { length: 101 },
        (_, i) => `c${i} TEXT`
      ).join(', ')})`
    );
    out.sizeAfter = this.ctx.storage.sql.databaseSize;
    return out;
  }

  // Grows `table` by `count` rows in one statement.
  seed(table: string, count: number) {
    this.run(
      `CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY, category TEXT, amount REAL, status TEXT, note TEXT, created_at TEXT)`
    );
    const result = this.run(
      `INSERT INTO ${table} (category, amount, status, note, created_at)
       WITH RECURSIVE s(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM s WHERE x < ?)
       SELECT 'cat' || (abs(random()) % 50), (abs(random()) % 100000) / 100.0,
              CASE abs(random()) % 3 WHEN 0 THEN 'pending' WHEN 1 THEN 'ready' ELSE 'delivered' END,
              'order note number ' || x, datetime('now', '-' || (x % 365) || ' days')
       FROM s`,
      count
    );
    return {
      result,
      total: this.run(`SELECT count(*) AS n FROM ${table}`),
      size: this.ctx.storage.sql.databaseSize
    };
  }

  scan(table: string) {
    return {
      groupBy: this.run(
        `SELECT category, count(*) AS n, sum(amount) AS total FROM ${table} GROUP BY category`
      ),
      filterUnindexed: this.run(
        `SELECT count(*) AS n FROM ${table} WHERE status = 'pending'`
      ),
      sortUnindexed: this.run(
        `SELECT id, amount FROM ${table} ORDER BY amount DESC LIMIT 50`
      ),
      queryPlan: this.run(
        `EXPLAIN QUERY PLAN SELECT category, count(*) FROM ${table} GROUP BY category`
      )
    };
  }

  // Changes `amount` from REAL to TEXT the way a column type change will:
  // new table, copy, drop, rename, indexes back, all in one transaction.
  rebuild(table: string) {
    const started = performance.now();
    try {
      const steps = this.ctx.storage.transactionSync(() => {
        const defer = this.run('PRAGMA defer_foreign_keys = ON');
        const create = this.run(
          `CREATE TABLE ${table}__new (id INTEGER PRIMARY KEY, category TEXT, amount TEXT, status TEXT, note TEXT, created_at TEXT)`
        );
        const copy = this.run(
          `INSERT INTO ${table}__new SELECT id, category, CAST(amount AS TEXT), status, note, created_at FROM ${table}`
        );
        const drop = this.run(`DROP TABLE ${table}`);
        const rename = this.run(
          `ALTER TABLE ${table}__new RENAME TO ${table}`
        );
        const index = this.run(
          `CREATE INDEX ${table}_status ON ${table}(status)`
        );
        if (!copy.ok || !drop.ok || !rename.ok) {
          throw new Error(JSON.stringify({ copy, drop, rename }));
        }
        return { defer, create, copy, drop, rename, index };
      });
      return { ok: true, ms: Math.round(performance.now() - started), steps };
    } catch (error) {
      return {
        ok: false,
        ms: Math.round(performance.now() - started),
        error: errorText(error)
      };
    }
  }

  queryOnly() {
    this.run('CREATE TABLE IF NOT EXISTS qo (id INTEGER PRIMARY KEY, v TEXT)');
    return {
      setOn: this.run('PRAGMA query_only = ON'),
      readPragma: this.run('PRAGMA query_only'),
      select: this.run('SELECT count(*) AS n FROM qo'),
      insert: this.run("INSERT INTO qo (v) VALUES ('blocked?')"),
      create: this.run('CREATE TABLE qo_blocked (id INTEGER PRIMARY KEY)'),
      delete: this.run('DELETE FROM qo'),
      setOff: this.run('PRAGMA query_only = OFF'),
      insertAfterOff: this.run("INSERT INTO qo (v) VALUES ('allowed')"),
      otherPragmas: {
        tableList: this.run('PRAGMA table_list'),
        tableXinfo: this.run("PRAGMA table_xinfo('qo')"),
        indexList: this.run("PRAGMA index_list('qo')"),
        quickCheck: this.run('PRAGMA quick_check'),
        optimize: this.run('PRAGMA optimize'),
        pageSize: this.run('PRAGMA page_size'),
        attach: this.run("ATTACH DATABASE ':memory:' AS other")
      }
    };
  }

  space(table: string) {
    const pages = () => ({
      size: this.ctx.storage.sql.databaseSize,
      pageCount: this.run('PRAGMA page_count').rows,
      freelist: this.run('PRAGMA freelist_count').rows
    });
    const before = pages();
    const autoVacuum = this.run('PRAGMA auto_vacuum');
    const deleteRows = this.run(`DELETE FROM ${table}`);
    const afterDelete = pages();
    const dropTable = this.run(`DROP TABLE ${table}`);
    const afterDrop = pages();
    const vacuum = this.run('VACUUM');
    const incremental = this.run('PRAGMA incremental_vacuum');
    const afterVacuum = pages();
    return {
      before,
      autoVacuum,
      deleteRows,
      afterDelete,
      dropTable,
      afterDrop,
      vacuum,
      incremental,
      afterVacuum
    };
  }

  size() {
    return { size: this.ctx.storage.sql.databaseSize };
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' }
  });

export default {
  async fetch(request: Request, env: Env) {
    if (request.headers.get('authorization') !== `Bearer ${env.SPIKE_TOKEN}`) {
      return json({ error: 'unauthorized' }, 401);
    }
    const url = new URL(request.url);
    const match = /^\/do\/([\w-]+)\/(\w+)$/.exec(url.pathname);
    if (!match || request.method !== 'POST') {
      return json({ error: 'POST /do/:name/:method' }, 404);
    }
    const [, name, method] = match;
    const args = (await request.json().catch(() => [])) as unknown[];
    const hint = url.searchParams.get('hint') as DurableObjectLocationHint | null;
    const stub = env.PROJECT_DATABASE.get(
      env.PROJECT_DATABASE.idFromName(name),
      hint ? { locationHint: hint } : undefined
    );
    const started = performance.now();
    try {
      const target = (stub as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
      const result = await target(...args);
      return json({
        workerColo: (request as { cf?: { colo?: string } }).cf?.colo,
        ms: Math.round(performance.now() - started),
        result
      });
    } catch (error) {
      return json(
        {
          workerColo: (request as { cf?: { colo?: string } }).cf?.colo,
          ms: Math.round(performance.now() - started),
          error: errorText(error)
        },
        500
      );
    }
  }
};
