#!/usr/bin/env node
// Copies the /today skill into Claude Code's skills folder (or a folder you name),
// with the record core beside it, so the skill works on its own.
//   node tools/install-skill.mjs                 -> ~/.claude/skills/today
//   node tools/install-skill.mjs <folder>        -> <folder>
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = process.argv[2] || join(homedir(), '.claude', 'skills', 'today');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of ['SKILL.md', 'record-format.md', 'today.mjs']) cpSync(join(repo, 'skill', f), join(dest, f));
cpSync(join(repo, 'site', 'core.js'), join(dest, 'core.js'), { dereference: true });
console.log(`Installed the TODAY skill in ${dest}`);
