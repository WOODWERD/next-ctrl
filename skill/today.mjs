#!/usr/bin/env node
// The /today skill's helper for Claude Code (build step B3, TD-R20).
// Claude does the language: splitting what was said, day words, tidy wording.
// This does the file work through `gh`, using the shared record core.
//
//   node today.mjs setup <owner/name>          save the record repo for this computer
//   node today.mjs list [--json]               Today, then Tomorrow, numbered
//   node today.mjs add --today "words" --tomorrow "words" ...   one commit for all of them
//   node today.mjs done <id>   |  move <id>  |  edit <id> "new words"
//
// The repo name lives in ~/.config/today/config.json (or TODAY_REPO). No token is
// kept here; gh's own sign-in is used (TD-R23).
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ymd, view, addChange, finishChange, moveChange, editChange, save, parseRecord, findOpen, dayOf,
  emptyRecord, RecordError, ConflictError,
} from './core.js';

const CONFIG = join(homedir(), '.config', 'today', 'config.json');
const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/* ---------- gh ---------- */

export function gh(args, input) {
  return new Promise((resolve, reject) => {
    const p = execFile('gh', args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.stderr = String(stderr || ''); err.stdout = String(stdout || ''); reject(err); } else resolve(stdout);
    });
    if (input !== undefined) { p.stdin.end(input); }
  });
}

const statusOf = (err) => {
  const m = /HTTP (\d{3})/.exec(`${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`);
  return m ? Number(m[1]) : 0;
};

// A store over GitHub's contents API, the shape core.save() expects.
export function githubStore(repo, run = gh) {
  const path = `repos/${repo}/contents/items.json`;
  return {
    async read() {
      try {
        const out = JSON.parse(await run(['api', path]));
        return { text: Buffer.from(out.content, 'base64').toString('utf8'), sha: out.sha };
      } catch (err) {
        if (statusOf(err) === 404) return null;
        throw err;
      }
    },
    async write(text, sha, message) {
      const body = { message, content: Buffer.from(text, 'utf8').toString('base64') };
      if (sha) body.sha = sha;
      try {
        const out = JSON.parse(await run(['api', '-X', 'PUT', path, '--input', '-'], JSON.stringify(body)));
        return out.content.sha;
      } catch (err) {
        const s = statusOf(err);
        if (s === 409 || (s === 422 && /sha/i.test(err.stderr || ''))) err.conflict = true;
        throw err;
      }
    },
  };
}

// TD-R08: never write to a public repo.
export async function checkPrivate(repo, run = gh) {
  let info;
  try { info = JSON.parse(await run(['api', `repos/${repo}`])); } catch (err) {
    if (statusOf(err) === 404) throw new RecordError(`Can't find ${repo}, or this computer's GitHub sign-in can't see it.`);
    throw err;
  }
  if (!info.private) throw new RecordError(`${repo} is public. Next Ctrl only writes to a private repo.`);
}

/* ---------- config ---------- */

export function readRepo(env = process.env, file = CONFIG) {
  if (env.TODAY_REPO) return env.TODAY_REPO;
  try { return JSON.parse(readFileSync(file, 'utf8')).repo || null; } catch { return null; }
}
function saveRepo(repo) {
  mkdirSync(join(homedir(), '.config', 'today'), { recursive: true });
  writeFileSync(CONFIG, JSON.stringify({ repo }, null, 2) + '\n');
}

/* ---------- words back to the person (TD-U21 table) ---------- */

export function addedLine(items, today) {
  const t = items.filter((i) => i.due <= today).map((i) => i.text);
  const m = items.filter((i) => i.due > today).map((i) => i.text);
  const parts = [];
  if (t.length) parts.push(`Added to Today: ${t.join('; ')}.`);
  if (m.length) parts.push(`${t.length ? 'Tomorrow' : 'Added to Tomorrow'}: ${m.join('; ')}.`);
  return parts.join(' ');
}

export function alreadyLine(items, today) {
  const t = items.filter((i) => i.due <= today).map((i) => i.text);
  const m = items.filter((i) => i.due > today).map((i) => i.text);
  const parts = [];
  if (t.length) parts.push(`Already on Today: ${t.join('; ')}.`);
  if (m.length) parts.push(`Already on Tomorrow: ${m.join('; ')}.`);
  return parts.join(' ');
}

export function listText(record, today) {
  const v = view(record, today);
  const lines = ['**Today**'];
  if (!v.today.length) lines.push("Today's clear.");
  v.today.forEach((it, n) => lines.push(`${n + 1}. ${it.text}${it.rolledLabel ? ` (${it.rolledLabel})` : ''}`));
  lines.push('**Tomorrow**');
  if (!v.tomorrow.length) lines.push('Nothing planned.');
  v.tomorrow.forEach((it, n) => lines.push(`${n + 1}. ${it.text}`));
  return lines.join('\n');
}

/* ---------- commands ---------- */

export function parseAddArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag !== '--today' && flag !== '--tomorrow') throw new RecordError(`Expected --today or --tomorrow, got ${flag}`);
    const text = args[++i];
    if (text === undefined) throw new RecordError(`${flag} needs words after it`);
    out.push({ day: flag.slice(2), text });
  }
  if (!out.length) throw new RecordError('Nothing to add');
  return out;
}

export async function run(argv, { store, today = ymd(new Date()), now = Date.now(), repo } = {}) {
  const [cmd, ...rest] = argv;
  if (cmd === 'add') {
    // Something already open with the same words isn't added twice (TD-R19).
    const got = await store.read();
    const record = got ? parseRecord(got.text) : emptyRecord();
    const already = [];
    const items = [];
    for (const a of parseAddArgs(rest)) {
      const c = addChange(a.text, a.day, { today, now, by: 'claude' });
      const open = findOpen(record, c.item.text) || items.find((x) => x.item.text.toLowerCase() === c.item.text.toLowerCase())?.item;
      if (open) already.push(open); else items.push(c);
    }
    if (items.length) await save(store, { type: 'batch', changes: items }, { today, now });
    return [addedLine(items.map((c) => c.item), today), alreadyLine(already, today)].filter(Boolean).join(' ');
  }
  if (cmd === 'list' || cmd === undefined) {
    const got = await store.read();
    const record = got ? parseRecord(got.text) : emptyRecord();
    if (rest.includes('--json')) {
      const v = view(record, today);
      return JSON.stringify({ today: v.today.map(pick), tomorrow: v.tomorrow.map(pick) }, null, 2);
    }
    return listText(record, today);
  }
  if (cmd === 'done' || cmd === 'move' || cmd === 'edit') {
    const [id, words] = rest;
    if (!id) throw new RecordError(`${cmd} needs an item id from "list --json"`);
    const got = await store.read();
    const record = got ? parseRecord(got.text) : emptyRecord();
    const it = record.items.find((i) => i.id === id);
    if (!it) throw new RecordError('That item is no longer on the list.');
    const change = cmd === 'done' ? finishChange(id)
      : cmd === 'move' ? moveChange(record, id, today)
      : editChange(id, words);
    const out = await save(store, change, { today, now });
    if (cmd === 'done') return `Done: ${it.text}.`;
    if (cmd === 'move') return `Moved to ${change.due > today ? 'Tomorrow' : 'Today'}: ${it.text}.`;
    return `Changed to: ${out.record.items.find((i) => i.id === id).text}.`;
  }
  throw new RecordError(`Unknown command: ${cmd}`);
}
const pick = (i) => ({ id: i.id, text: i.text, rolled: i.rolled });

/* ---------- command line ---------- */

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'setup') {
    const repo = argv[1];
    if (!REPO_RE.test(repo || '')) throw new RecordError('Give the repo as owner/name, like yourname/Next-Ctrl-RECORD');
    await checkPrivate(repo);
    saveRepo(repo);
    return `Next Ctrl is set up on this computer: ${repo}.`;
  }
  const repo = readRepo();
  if (!repo) return "Next Ctrl isn't set up here. Tell me your record repo, like yourname/Next-Ctrl-RECORD.";
  if (argv[0] !== 'list' && argv[0] !== undefined) await checkPrivate(repo);
  return run(argv, { store: githubStore(repo), repo });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((line) => { console.log(line); }).catch((err) => {
    if (err instanceof RecordError || err instanceof ConflictError) { console.log(err.message); process.exit(2); }
    const s = statusOf(err);
    if (s === 401 || s === 403) console.log("GitHub turned this computer's sign-in down. Run: gh auth login");
    else console.log(`Couldn't reach your Next Ctrl repo, so nothing was changed. (${(err.stderr || err.message || '').trim().split('\n')[0]})`);
    process.exit(1);
  });
}
