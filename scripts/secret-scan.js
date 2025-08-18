#!/usr/bin/env node
/*
 Simple secret scanner for staged files.
 - Blocks high-entropy strings and known key patterns
 - Skips common binary/lock/build folders
 Usage: node scripts/secret-scan.js [--staged]
*/

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function getStagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

function listTargets(args) {
  if (args.includes('--staged')) return getStagedFiles();
  const out = execSync('git ls-files', { encoding: 'utf8' });
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

const SKIP_DIRS = new Set([
  'node_modules/', '.git/', 'dist/', 'build/', '.husky/', '.vscode/', '.local/', '.config/'
]);

const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf', '.lock', '.pem']);
const SKIP_FILES = new Set([
  'env.example', 'render.env.example', 'render.env.production'
]);

const KNOWN_PATTERNS = [
  /SK[_-]?(LIVE|TEST)[A-Za-z0-9_\-]{12,}/i,                 // generic sk_live/test
  /pk_live_[A-Za-z0-9]{20,}/i,                               // paystack style public
  /sk_live_[A-Za-z0-9]{20,}/i,                               // paystack style secret
  /FLWSECK[_A-Za-z0-9\-]{10,}/,                              // flutterwave secret
  /FLWPUBK[_A-Za-z0-9\-]{10,}/,                              // flutterwave public
  /AIza[0-9A-Za-z\-_]{35}/,                                  // Google API key
  /AKIA[0-9A-Z]{16}/,                                         // AWS Access Key
  /SECRET[_A-Z0-9]*\s*=\s*['\"][A-Za-z0-9._\-]{16,}['\"]/i,
  /SESSION_SECRET\s*=\s*['\"][A-Za-z0-9._\-]{16,}['\"]/i,
  /OPENAI_API_KEY\s*=\s*['\"][A-Za-z0-9_\-]{20,}['\"]/i,
  /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/,
];

function shannonEntropy(str) {
  const len = str.length;
  const map = new Map();
  for (const ch of str) map.set(ch, (map.get(ch) || 0) + 1);
  let entropy = 0;
  for (const [, count] of map) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function looksSensitiveToken(token) {
  if (token.length < 24) return false;
  const base64ish = /^[A-Za-z0-9+/_=-]+$/; // include - and _ for URL-safe
  if (!base64ish.test(token)) return false;
  const ent = shannonEntropy(token);
  return ent > 3.5; // heuristic threshold
}

function scanContent(content, file) {
  const findings = [];
  for (const rx of KNOWN_PATTERNS) {
    if (rx.test(content)) findings.push({ type: 'pattern', pattern: rx.toString() });
  }
  // entropy scan across long tokens
  const tokens = content.match(/[A-Za-z0-9+/_=-]{24,}/g) || [];
  for (const t of tokens) {
    if (looksSensitiveToken(t)) findings.push({ type: 'entropy', sample: t.slice(0, 8) + '...' });
  }
  return findings;
}

function isSkipped(file) {
  if (!file) return true;
  const p = file.replace(/\\/g, '/');
  for (const dir of SKIP_DIRS) if (p.startsWith(dir)) return true;
  const ext = path.extname(p).toLowerCase();
  if (BINARY_EXTS.has(ext)) return true;
  const base = path.basename(p);
  if (SKIP_FILES.has(base)) return true;
  if (/(^|\/)tests\//.test(p)) return true; // ignore tests
  if (ext === '.md' || ext === '.mdx' || ext === '.txt') return true; // ignore docs
  return false;
}

function main() {
  const args = process.argv.slice(2);
  const targets = listTargets(args);
  let violations = 0;
  for (const file of targets) {
    if (isSkipped(file)) continue;
    const abs = path.join(repoRoot, file);
    if (!existsSync(abs)) continue;
    const st = statSync(abs);
    if (!st.isFile()) continue;
    try {
      const content = readFileSync(abs, 'utf8');
      const findings = scanContent(content, file);
      if (findings.length) {
        violations++;
        console.error(`\n[secret-scan] Potential secret(s) found in: ${file}`);
        for (const f of findings.slice(0, 5)) {
          if (f.type === 'pattern') console.error(`  - Pattern match: ${f.pattern}`);
          else console.error(`  - High entropy token detected: ${f.sample}`);
        }
        if (findings.length > 5) console.error(`  ...and ${findings.length - 5} more findings`);
      }
    } catch (e) {
      // ignore unreadable
    }
  }

  if (violations > 0) {
    console.error(`\n[secret-scan] Found ${violations} file(s) with potential secrets. Aborting.`);
    process.exit(1);
  } else {
    console.log('[secret-scan] No secrets detected.');
  }
}

main();
