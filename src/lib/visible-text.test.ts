import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Developer notes must never show up on screen. In JSX, a `// comment` written between tags is rendered as
// text (use {/* ... */} instead), and TODO/FIXME markers belong in comments only.
const srcDir = fileURLToPath(new URL("../", import.meta.url));
const tsxFiles: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = dir + name;
    if (statSync(full).isDirectory()) walk(full + "/"); else if (name.endsWith(".tsx")) tsxFiles.push(full);
  }
})(srcDir);

const rel = (f: string) => f.slice(srcDir.length);

test("no `// comment` is written as text between JSX tags", () => {
  assert.ok(tsxFiles.length > 40, `only found ${tsxFiles.length} .tsx files`);
  const offenders: string[] = [];
  for (const f of tsxFiles) {
    const lines = readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/^\s*\/\//.test(line)) return;
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === "") j--;
      // A comment straight after a line that ends a JSX tag (">" but not an arrow "=>") is text, not a comment.
      if (j >= 0 && /(?<!=)>\s*$/.test(lines[j]) && !/^\s*(import|export|type|interface)\b/.test(lines[j])) offenders.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, [], `these render on screen:\n${offenders.join("\n")}`);
});

test("TODO / FIXME markers appear only inside comments", () => {
  const offenders: string[] = [];
  for (const f of tsxFiles) {
    readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      if (!/\b(TODO|FIXME|XXX)\b/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line) || /\/\/.*\b(TODO|FIXME|XXX)\b/.test(line) || /\{\/\*.*\b(TODO|FIXME|XXX)\b/.test(line)) return;
      offenders.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, [], `TODO text outside a comment:\n${offenders.join("\n")}`);
});
