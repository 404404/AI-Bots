import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const mapDirectory = '.agents/skills/verify-deepseekbot/features';
const sections = [
  'Sub-features',
  'How to get to it (user POV)',
  'Driving it with verify-app',
  'Gotchas',
];
const scriptsIn = (text) =>
  new Set([...text.matchAll(/\bscripts\/[\w/-]+\.mjs\b/gu)].map(([path]) => path));

export function checkFeatureMap(repo = root) {
  const directory = join(repo, mapDirectory);
  const files = readdirSync(directory).filter(
    (name) => name.endsWith('.md') && name !== 'README.md',
  );
  const index = readFileSync(join(directory, 'README.md'), 'utf8');
  const errors = [];
  const mappedScripts = new Set();
  for (const file of files) {
    const rows = index
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('|') &&
          line.trimEnd().replace(/\|$/u, '').split('|').at(-1)?.includes(`](${file})`),
      );
    if (rows.length !== 1)
      errors.push(`${file}: expected exactly one feature index row, found ${rows.length}`);
    const text = readFileSync(join(directory, file), 'utf8');
    for (const heading of sections)
      if (!text.split('\n').includes(`## ${heading}`))
        errors.push(`${file}: missing section ${heading}`);
    const journeys = [...scriptsIn(text)].filter((path) => path.startsWith('scripts/e2e-'));
    for (const journey of journeys) {
      mappedScripts.add(journey);
      if (rows.length === 1 && !rows[0].includes(journey))
        errors.push(`${file}: index row is missing journey ${journey}`);
    }
    for (const journey of scriptsIn(rows.join('\n')))
      if (!journeys.includes(journey))
        errors.push(`${file}: index journey is absent from the feature: ${journey}`);
  }
  const skill = dirname(directory);
  const documents = [
    join(skill, 'SKILL.md'),
    join(skill, 'references', 'observation.md'),
    ...['README.md', ...files].map((file) => join(directory, file)),
  ];
  for (const document of documents) {
    if (!existsSync(document)) {
      errors.push(`missing document: ${document}`);
      continue;
    }
    const text = readFileSync(document, 'utf8');
    for (const path of scriptsIn(text))
      if (!existsSync(join(repo, path))) errors.push(`${document}: missing script ${path}`);
    for (const [, target] of text.matchAll(/\]\(([^\s)]+)\)/gu)) {
      if (/^(?:[a-z]+:|#)/iu.test(target)) continue;
      const path = target.split('#')[0];
      if (path && !existsSync(resolve(dirname(document), path)))
        errors.push(`${document}: broken link ${target}`);
    }
  }
  const available = readdirSync(join(repo, 'scripts')).filter((name) =>
    /^e2e-.*\.mjs$/u.test(name),
  );
  return {
    ok: errors.length === 0,
    features: files.length,
    mappedJourneys: mappedScripts.size,
    unmappedJourneys: available
      .map((name) => `scripts/${name}`)
      .filter((path) => !mappedScripts.has(path))
      .sort(),
    errors,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkFeatureMap();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
