/* 把一份 migrate-*.sql 打到「pages dev 用的那个本地 D1」上。
   wrangler d1 execute --local 打的是另一份库（binding 由 --d1 传，id 不同），
   所以本地调完接口要真正生效，得走这个脚本。
   用法：node --experimental-sqlite db/apply-local.mjs db/migrate-024.sql
   可选第二个参数：sqlite 文件名前缀（默认 7febae5a8111） */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sqlFile = process.argv[2];
const want = process.argv[3] || '7febae5a8111';
if (!sqlFile) {
  console.error('用法: node --experimental-sqlite db/apply-local.mjs <sql 文件> [文件名前缀]');
  process.exit(1);
}

const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const hit = readdirSync(dir).filter((f) => f.startsWith(want) && f.endsWith('.sqlite'));
if (!hit.length) {
  console.error('没找到本地库，先跑一次 npx wrangler pages dev');
  process.exit(1);
}

const path = join(dir, hit[0]);
const db = new DatabaseSync(path);
const sql = readFileSync(sqlFile, 'utf8');
db.exec(sql);
console.log('已执行', sqlFile, '→', hit[0]);
db.close();
