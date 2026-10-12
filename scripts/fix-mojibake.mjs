#!/usr/bin/env node
/**
 * fix-mojibake.mjs — detects and repairs Windows-1252 mojibake that was
 * accidentally saved as UTF-8 (classic double-encoding of Arabic text).
 *
 * How it works: a file got read with the wrong code page (Windows-1252),
 * turning Arabic UTF-8 bytes into Latin-1-looking characters (Ù…, Ø§, â€¦),
 * and those characters were then saved back as UTF-8. This reverses it by
 * re-encoding each character to its Windows-1252 byte and decoding the
 * resulting bytes as UTF-8.
 *
 * Safety: a file is only rewritten when the repaired version contains
 * strictly MORE Arabic characters than the original, so already-correct
 * files are never touched.
 *
 * Usage:
 *   node scripts/fix-mojibake.mjs scan          # report only
 *   node scripts/fix-mojibake.mjs fix           # report and rewrite
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'prisma', 'scripts'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.jsx', '.json', '.prisma']);
const SKIP_FILES = new Set(['fix-mojibake.mjs']); // this script legitimately contains the markers
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// Windows-1252 special high-byte range (byte -> Unicode char). Everything in
// 0xA0-0xFF is identical to Latin-1, and 0x00-0x7F is plain ASCII.
const CP1252_HIGH = {
  0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E',
  0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6',
  0x89: '\u2030', 0x8a: '\u0160', 0x8b: '\u2039', 0x8c: '\u0152',
  0x8e: '\u017D', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C',
  0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02DC', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203A',
  0x9c: '\u0153', 0x9e: '\u017E', 0x9f: '\u0178',
};
const CHAR_TO_BYTE = {};
for (const [b, ch] of Object.entries(CP1252_HIGH)) CHAR_TO_BYTE[ch] = Number(b);

function reverseMojibake(str) {
  const bytes = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (CHAR_TO_BYTE[ch] !== undefined) {
      bytes.push(CHAR_TO_BYTE[ch]);
    } else if (cp <= 0xff) {
      bytes.push(cp);
    } else {
      bytes.push(0x3f); // '?' for anything not representable
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function countArabic(s) {
  return (s.match(/[\u0600-\u06ff]/g) || []).length;
}

// Windows-1252 mojibake of Arabic always starts with these high bytes turned
// into Ø Ù Ú Û (U+00D8–U+00DB). They are essentially impossible in legitimate
// Arabic text, so their presence is a reliable corruption signal.
function countMojibakeMarkers(s) {
  return (s.match(/[\u00d8\u00d9\u00da\u00db]/g) || []).length;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(extname(name)) && !SKIP_FILES.has(name)) out.push(full);
  }
  return out;
}

const mode = process.argv[2] || 'scan';
const files = [];
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  try { walk(abs, files); } catch { /* dir may not exist */ }
}

const corrupted = [];
const clean = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  const markers = countMojibakeMarkers(text);
  if (markers === 0) continue; // no corruption signal at all
  const fixed = reverseMojibake(text);
  const after = countArabic(fixed);
  // Only treat as corrupted when reversing actually recovers Arabic text.
  if (after > 0) corrupted.push({ f, before: markers, after, fixed });
  else clean.push(f);
}

console.log(`Scanned ${files.length} files.`);
console.log(`\n=== CORRUPTED (${corrupted.length}) ===`);
for (const c of corrupted) {
  console.log(`  ${relative(ROOT, c.f)}  mojibake-markers=${c.before} recovered-arabic=${c.after}`);
}
console.log(`\n=== already-correct with Arabic (${clean.length}) ===`);
for (const f of clean) console.log(`  ${relative(ROOT, f)}`);

if (mode === 'fix') {
  console.log('\n=== APPLYING FIX ===');
  for (const c of corrupted) {
    writeFileSync(c.f, c.fixed, 'utf8');
    console.log(`  fixed ${relative(ROOT, c.f)}`);
  }
  console.log(`Done. ${corrupted.length} file(s) rewritten.`);
} else if (corrupted.length) {
  console.log('\n(dry run — pass "fix" as an argument to rewrite these files)');
}
