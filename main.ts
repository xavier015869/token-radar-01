// Token launch radar: the hand-in program for make.fun's token-radar-01 bounty.
//
// It reads the sealed DefiLlama snapshot (/input/snapshot.json, or --input),
// scores every protocol that records no token with the model in lib/model.ts,
// writes the ranked board to /output/board.json, writes the dashboard's data
// to /output/data.js, copies dashboard/ and screenshots/ into /output, and
// finishes with /output/dossier.json from the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, boardRows, buildBoard, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the dossier text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(1);
}

const snap = parseSnapshot(readFileSync(inputFile, 'utf8'));
const board = buildBoard(snap);
const rows = boardRows(board);

const issue = boardIssue(rows, snap);
if (issue !== null) {
  process.stderr.write(`token radar: the board is not fit to hand in: ${issue}\n`);
  process.exit(1);
}

const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(board, snap));

/** Copy a directory tree of plain files, refusing anything else. */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    const st = statSync(src);
    if (st.isDirectory()) copyTree(src, dst);
    else if (st.isFile()) copyFileSync(src, dst);
    else throw new Error(`token radar: ${src} is not a plain file or directory`);
  }
}

copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
copyTree(join(here, 'screenshots'), join(out, 'screenshots'));

const shots = readdirSync(join(out, 'screenshots')).filter((n) => IMAGE_NAME.test(n));
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${rows.length} pre-token protocols ranked, watchlist ${snap.watchlist.length}/${snap.watchlist.length} covered; ` +
    `wrote board.json, data.js, dashboard/, screenshots/ (${shots.length} images) and dossier.json to ${out}\n`,
);
for (const r of rows.slice(0, 5)) {
  process.stdout.write(`  #${r.rank} ${r.name} — $${r.implied_value_usd.toLocaleString('en-US')} implied\n`);
}
