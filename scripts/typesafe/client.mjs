import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, chmodSync, openSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';

export const MODEL = 'jev-1.13.0';
export const RESERVE_NANO = 10_000_000;
export const CAPS = Object.freeze({ 'ux-hate': 1250000000, research: 600000000, kura: 1750000000,
  succession: 500000000, kobe: 350000000, seoul: 200000000, formpilot: 200000000, cleanpaste: 150000000 });
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export function validateResponse(body, questions) {
  if (!record(body) || body.model !== MODEL || !record(body.answers) || !record(body.usage)
    || !Number.isSafeInteger(body.usage.input_tokens) || body.usage.input_tokens < 0
    || body.usage.input_tokens > 65536 || !Number.isSafeInteger(body.usage.output_tokens)
    || body.usage.output_tokens < 0 || Object.keys(body.answers).length !== Object.keys(questions).length) {
    throw new Error('Invalid provider envelope');
  }
  for (const [id, question] of Object.entries(questions)) {
    const answer = body.answers[id];
    if (!record(answer) || answer.type !== question.type) throw new Error('Invalid answer type');
    if (question.type === 'noul') {
      if (!probability(answer.noul)) throw new Error('Invalid probability');
      continue;
    }
    const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
    const p = answer.probabilities;
    if (!probability(answer.confidence) || !record(p) || Object.keys(p).length !== keys.length
      || !keys.every(key => probability(p[key])) || Math.abs(keys.reduce((sum, key) => sum + p[key], 0) - 1) > keys.length * 0.005 + 1e-9) {
      throw new Error('Invalid distribution');
    }
    if (question.type === 'choice') {
      if (!keys.includes(answer.choice) || keys.some(key => p[key] > p[answer.choice])) throw new Error('Invalid choice');
    } else if (question.type === 'score') {
      const expected = keys.reduce((sum, key) => sum + Number(key) * p[key], 0);
      if (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1 || Math.abs(answer.score - expected) > 0.005 * (keys.reduce((sum, key) => sum + Number(key), 0) + 1) + 1e-9) throw new Error('Invalid score');
    } else throw new Error('Unknown question type');
  }
  return body;
}

export class Ledger {
  static initialize(path, project, limit = CAPS[project]) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > CAPS[project] || !Object.hasOwn(CAPS, project)) throw new Error('Invalid allocation');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // Exclusive creation prevents accidentally resetting a ledger.
    closeSync(openSync(path, 'wx', 0o600));
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE budget (id INTEGER PRIMARY KEY CHECK(id=1), project TEXT NOT NULL,
      limit_nano INTEGER NOT NULL, charged_nano INTEGER NOT NULL DEFAULT 0,
      closed INTEGER NOT NULL DEFAULT 0, CHECK(charged_nano>=0 AND charged_nano<=limit_nano));
      CREATE TABLE requests (id TEXT PRIMARY KEY, hash TEXT NOT NULL, charge_nano INTEGER NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0, model TEXT, latency_ms INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE cache (hash TEXT PRIMARY KEY, result TEXT NOT NULL);`);
    db.prepare('INSERT INTO budget(id,project,limit_nano) VALUES(1,?,?)').run(project, limit);
    db.close();
  }
  constructor(path, project) {
    if (!existsSync(path)) throw new Error('Budget must be initialized explicitly');
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS metrics (request_id TEXT PRIMARY KEY, version TEXT NOT NULL, model TEXT NOT NULL, latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, outcome TEXT NOT NULL)');
    chmodSync(path, 0o600);
    if (this.status().project !== project) { this.db.close(); throw new Error('Wrong project ledger'); }
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  status() { return this.db.prepare('SELECT * FROM budget WHERE id=1').get(); }
  reserve(hash) {
    return this.transaction(() => {
      const budget = this.status();
      if (budget.closed || budget.charged_nano + RESERVE_NANO > budget.limit_nano) throw new Error('Budget unavailable');
      const id = randomUUID();
      this.db.prepare('UPDATE budget SET charged_nano=charged_nano+? WHERE id=1').run(RESERVE_NANO);
      this.db.prepare('INSERT INTO requests(id,hash,charge_nano) VALUES(?,?,?)').run(id, hash, RESERVE_NANO);
      return id;
    });
  }
  settle(id, body, latency, cacheHash) {
    const cost = body.usage.input_tokens * 42;
    if (!Number.isSafeInteger(cost) || cost < 0 || cost > RESERVE_NANO) throw new Error('Invalid cost');
    this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);
      if (!row || row.settled) throw new Error('Unknown or settled reservation');
      this.db.prepare('UPDATE budget SET charged_nano=charged_nano-?+? WHERE id=1').run(row.charge_nano, cost);
      this.db.prepare('UPDATE requests SET charge_nano=?,settled=1,model=?,latency_ms=? WHERE id=?').run(cost, body.model, latency, id);
      if (cacheHash) this.db.prepare('INSERT OR REPLACE INTO cache VALUES(?,?)').run(cacheHash, JSON.stringify(body));
    });
  }
  record(id, version, model, latency, usage, outcome) {
    this.db.prepare('INSERT OR REPLACE INTO metrics VALUES(?,?,?,?,?,?,?)').run(id, version, model, latency, usage?.input_tokens ?? null, usage?.output_tokens ?? null, outcome);
  }
  cached(hash) { const row = this.db.prepare('SELECT result FROM cache WHERE hash=?').get(hash); return row ? JSON.parse(row.result) : null; }
  handoff() {
    return this.transaction(() => {
      const row = this.status();
      if (row.closed) throw new Error('Ledger already handed off');
      this.db.prepare('UPDATE budget SET closed=1 WHERE id=1').run();
      return { project: row.project, spentOrReservedNano: row.charged_nano,
        remainingNano: row.limit_nano - row.charged_nano, ledgerClosed: true };
    });
  }
  close() { this.db.close(); }
}

export async function evaluate({ state, questions, version, ledger, apiKey = process.env.TYPESAFE_API_KEY,
  cachePublic = false, fetchImpl = fetch, timeoutMs = 8000 }) {
  const payload = { model: MODEL, state, questions };
  const json = JSON.stringify(payload);
  // Bound UTF-8 bytes conservatively; never truncate evidence or personal text.
  if (Buffer.byteLength(json) > 24000 || !version) throw new Error('Input exceeds request limit');
  const hash = fingerprint({ version, payload });
  if (ledger.status().closed) throw new Error('Ledger handed off');
  if (cachePublic) {
    const cached = ledger.cached(hash);
    if (cached) return { ...validateResponse(cached, questions), cached: true, costNano: 0, latencyMs: 0 };
  }
  if (!apiKey) throw new Error('Missing TypeSafe credential');
  const id = ledger.reserve(hash);
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: json, signal: controller.signal, redirect: 'error',
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Provider unavailable'); }
    const reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 262144) { await reader.cancel(); throw new Error('Response too large'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const body = validateResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')), questions);
    const latencyMs = Math.round(performance.now() - start);
    ledger.settle(id, body, latencyMs, cachePublic ? hash : null);
    ledger.record(id, version, body.model, latencyMs, body.usage, 'success');
    return { ...body, cached: false, costNano: body.usage.input_tokens * 42, latencyMs };
  } catch (error) {
    ledger.record(id, version, MODEL, Math.round(performance.now() - start), null, 'ambiguous_failure');
    throw error;
  } finally { clearTimeout(timer); }
}
