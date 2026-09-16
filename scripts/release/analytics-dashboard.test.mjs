import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { countQuery, historyQuery } from '../analytics/dashboard.mjs';

// Execute the shipped query predicates and aggregation against a deterministic fixture.
// Only ClickHouse date/aggregate syntax is adapted to SQLite; live setup also validates HogQL.
test('dashboard counts distinct installations across inclusive UTC windows', () => {
  const queries = [1, 7, 30].map(countQuery).concat(historyQuery).map((query) => query
    .replaceAll("toDate(toTimeZone(now(), 'UTC'))", "'2026-09-16'")
    .replace(/'2026-09-16' - INTERVAL (\d+) DAY/g, "date('2026-09-16', '-$1 days')")
    .replaceAll('properties.environment', 'environment')
    .replaceAll('properties.active_date', 'active_date')
    .replaceAll('uniqExact(distinct_id)', 'count(DISTINCT distinct_id)')
    .replaceAll('toDate(', 'date(').replaceAll('toString(', 'string('));
  const result = spawnSync('python3', ['-c', `
import json, sqlite3, sys
connection = sqlite3.connect(':memory:')
connection.create_function('string', 1, str)
connection.execute('CREATE TABLE events(event, environment, active_date, distinct_id)')
rows = [
 ('active_day', 'production', '2026-09-16', 'A'),
 ('active_day', 'production', '2026-09-16', 'A'),
 ('active_day', 'production', '2026-09-15', 'A'),
 ('active_day', 'production', '2026-09-10', 'B'),
 ('active_day', 'production', '2026-09-09', 'B'),
 ('active_day', 'production', '2026-08-18', 'C'),
 ('active_day', 'production', '2026-08-17', 'D'),
 ('active_day', 'test', '2026-09-16', 'E'),
 ('page_view', 'production', '2026-09-16', 'F'),
 ('active_day', 'production', '2026-09-17', 'G'),
]
connection.executemany('INSERT INTO events VALUES (?, ?, ?, ?)', rows)
print(json.dumps([connection.execute(query).fetchall() for query in json.load(sys.stdin)]))
`], { input: JSON.stringify(queries), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const [daily, weekly, monthly, history] = JSON.parse(result.stdout);
  assert.deepEqual([daily, weekly, monthly], [[[1]], [[2]], [[3]]]);
  assert.deepEqual(history, [
    ['2026-08-18', 1], ['2026-09-09', 1], ['2026-09-10', 1],
    ['2026-09-15', 1], ['2026-09-16', 1],
  ]);
});
