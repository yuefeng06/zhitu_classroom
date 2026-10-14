// Format maintained sources only. Never recurse into private or exported data.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import * as prettier from 'prettier';
import { format as formatSql } from 'sql-formatter';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(new URL('../.prettierrc.json', import.meta.url), 'utf8'));
const sqlFiles = [
  'database/patch_notes_mysql.sql',
  'database/patch_missing_tables_mysql.sql',
  'database/答辩演示_只读查询.sql',
];

export async function sourceFiles() {
  const entries = await readdir(root, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(?:js|mjs|css|html)$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => name !== 'handwriting-data.js');
  for (const directory of ['scripts', 'tests']) {
    const entries = await readdir(resolve(root, directory), { withFileTypes: true });
    files.push(
      ...entries
        .filter((entry) => entry.isFile() && /\.(?:js|mjs)$/.test(entry.name))
        .map((entry) => `${directory}/${entry.name}`),
    );
  }
  return [
    ...files,
    'thesis/generate-latex.mjs',
    'package.json',
    '.prettierrc.json',
    'media-sources.json',
    ...sqlFiles,
  ].sort();
}

export async function formattedSource(file, source) {
  if (sqlFiles.includes(file)) {
    return `${formatSql(source, {
      language: 'mysql',
      tabWidth: 2,
      keywordCase: 'preserve',
      linesBetweenQueries: 1,
    }).trimEnd()}\n`;
  }

  // Preserve the article importer output byte for byte, while formatting the
  // handwritten functions around it. The placeholder is a standalone comment.
  const generated = [];
  const input =
    file === 'study-posts.js'
      ? source.replace(
          /\/\/ BEGIN SMART QUESTIONS[^\r\n]*[\s\S]*?\/\/ END SMART QUESTIONS[^\r\n]*/g,
          (block) => {
            const index = generated.push(block) - 1;
            return `// ZHITU_FORMAT_GENERATED_${index}`;
          },
        )
      : source;
  const output = await prettier.format(input, { ...config, filepath: file });
  return generated.length
    ? output.replace(/\/\/ ZHITU_FORMAT_GENERATED_(\d+)/g, (_, index) => generated[Number(index)])
    : output;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--write', '--check'].includes(args[0])) {
    throw new Error('Usage: node scripts/format-code.mjs --write|--check');
  }
  const check = args[0] === '--check';
  const files = await sourceFiles();
  let changed = 0;
  for (const file of files) {
    const path = resolve(root, file);
    const source = await readFile(path, 'utf8');
    const formatted = await formattedSource(file, source);
    if (source === formatted) continue;
    changed++;
    if (check) console.error(`Needs formatting: ${file}`);
    else {
      await writeFile(path, formatted, 'utf8');
      console.log(`Formatted: ${file}`);
    }
  }
  console.log(
    `${files.length} source files checked; ${changed} ${check ? 'need formatting' : 'updated'}.`,
  );
  if (check && changed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
