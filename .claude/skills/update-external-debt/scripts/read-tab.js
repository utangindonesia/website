#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [xlsx, year, mon] = process.argv.slice(2);
if (!xlsx || !/^\d{4}$/.test(year || '') || !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(mon || '')) {
  console.error('Usage: node read-tab.js <xlsx-path> <YYYY> <Mon>');
  process.exit(2);
}

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'xlsx-'));
execFileSync('unzip', ['-oq', xlsx, '-d', dir]);
const read = file => fs.readFileSync(path.join(dir, file), 'utf8');
const sheet = [...read('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
  .find(match => match[1] === 'TabI.1');
if (!sheet) throw new Error('sheet TabI.1 not found');
const rid = sheet[2];
const relationship = read('xl/_rels/workbook.xml.rels').match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`));
if (!relationship) throw new Error(`relationship ${rid} not found`);
const target = relationship[1];
const sharedStrings = [...read('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)]
  .map(match => [...match[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(text => text[1]).join(''));
const rows = [...read('xl/' + target.replace(/^\/?xl\//, '')).matchAll(/<row [^>]*>(.*?)<\/row>/gs)].map(row => {
  const cells = {};
  for (const [, col, type, value] of row[1].matchAll(/<c r="([A-Z]+)\d+"(?: [^>]*t="([^"]+)")?[^>]*>(?:<v>(.*?)<\/v>)?/g)) {
    if (value !== undefined) cells[col] = (type === 's' ? sharedStrings[+value] : value).trim().replace(/\*+$/, '');
  }
  return cells;
});
const label = row => Object.values(row).join(' ');
const isYear = value => value === year;
const yearRow = rows.find(row => Object.values(row).some(isYear));
if (!yearRow) throw new Error(`year ${year} not found`);
const monthRow = rows.find(row => Object.values(row).filter(value => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(value)).length > 12);
if (!monthRow) throw new Error('month header not found');
const colNum = col => [...col].reduce((number, char) => number * 26 + char.charCodeAt(0) - 64, 0);
const startCol = colNum(Object.entries(yearRow).find(([, value]) => isYear(value))[0]);
const yearCols = Object.entries(yearRow).filter(([, value]) => /^\d{4}$/.test(value)).map(([col]) => colNum(col)).sort((a, b) => a - b);
const endCol = yearCols.find(number => number > startCol) ?? Infinity;
const monthCols = Object.entries(monthRow).filter(([col, value]) => value === mon && colNum(col) >= startCol && colNum(col) < endCol);
if (!monthCols.length && mon !== 'Dec') throw new Error(`no ${mon} ${year} column — pre-2015 years are year-end only`);
const col = monthCols.length ? monthCols[0][0] : Object.entries(yearRow).find(([, value]) => value === year)[0];
const pick = regex => {
  const row = rows.find(candidate => regex.test(label(candidate)));
  if (!row || row[col] === undefined) throw new Error(`value ${regex} for ${mon} ${year} not found`);
  return Math.round(Number(row[col]));
};
console.log(JSON.stringify({
  date: `${year}-${mon}`,
  total: pick(/^TOTAL/),
  government: pick(/1\.1 Pemerintah/),
  central_bank: pick(/1\.2 Bank Sentral/),
  private: pick(/^2\. Swasta/),
}));
