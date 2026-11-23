// Token Launch Radar — the entrypoint make.fun runs.
//
// This file is a thin shell around the two pieces that do the real work.
// lib/model.ts holds the ranking model: it reads the sealed snapshot and
// turns it into a board of protocols that record no token, each with an
// implied value and a farm plan. vendor/makefun-board.ts holds the
// house's dossier writer. The shell only wires them to the filesystem —
// snapshot in, hand-in out.
//
// What lands in the output directory:
//   board.json    the ranked rows the gate scores
//   data.js       the same board in the compact shape the page renders,
//                 written at the output's root, where the copied page
//                 looks for it one level up from its own folder
//   dashboard/    a straight copy of the page that ships in this repo
//   screenshots/  a straight copy of the three judged views
//   dossier.json  buildDossier's record of the two copies above, built
//                 last, once both are in place

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { boardIssue, boardRows, buildBoard, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The value that follows a flag on the command line, or null. */
function flagValue(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : null;
}

// The repository's own folder, so the dashboard and screenshots are found
// next to this file wherever the program is started from.
const here = dirname(fileURLToPath(import.meta.url));

// In the grading sandbox the snapshot waits at /input/snapshot.json and
// the hand-in goes to /output; a local run names the input with --input
// and the destination with --out or MAKEFUN_OUTPUT_DIR.
const inputPath = flagValue('--input') ?? '/input/snapshot.json';
const outputDir = flagValue('--out') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const snap = parseSnapshot(readFileSync(inputPath, 'utf8'));
const board = buildBoard(snap);
const rows = boardRows(board);

// A board that fails the model's own checks is not handed in at all: the
// gate would refuse it, and a loud failure here beats a silent zero.
const issue = boardIssue(rows, snap);
if (issue !== null) {
  throw new Error(`refusing to hand in this board: ${issue}`);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(board, snap));
cpSync(join(here, 'dashboard'), join(outputDir, 'dashboard'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

// The dossier describes the dashboard and screenshots as handed in, so it
// is built only after both copies are sitting in the output directory.
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, { text_max_bytes: 65536 }));

const onBoard = new Set(rows.map((r) => r.slug));
const covered = snap.watchlist.filter((slug) => onBoard.has(slug)).length;
const shots = readdirSync(join(outputDir, 'screenshots')).length;
console.log(
  `token radar: ${rows.length} pre-token protocols ranked, watchlist ${covered}/${snap.watchlist.length} covered; ` +
  `wrote board.json, data.js, dashboard/, screenshots/ (${shots} images) and dossier.json to ${outputDir}`,
);
for (const r of rows.slice(0, 5)) {
  console.log(`  #${r.rank} ${r.name} — $${r.implied_value_usd.toLocaleString('en-US')} implied`);
}
