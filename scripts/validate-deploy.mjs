import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const site = join(root, 'site');
const required = [
  'index.html', 'styles.css', 'manifest.webmanifest', 'service-worker.js',
  'icon.svg', 'icon-192.png', 'icon-512.png',
  'pfmea-project.schema.json', 'pfmea-completion-rules.json', 'data-model.ts',
  'js/model.js', 'js/storage.js', 'js/exporters.js', 'js/app.js', '.nojekyll'
];

for (const file of required) {
  if (!existsSync(join(site, file))) throw new Error(`Falta archivo requerido: site/${file}`);
}

const forbidden = [
  /guardian/i,
  /transflutr/i,
  /planta\s+pilar/i,
  /sc\s+johnson/i,
  /apc000004/i,
  /pfmea-gua/i,
  /pfd-gua/i,
  /urs-gua/i
];
const textExt = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt']);
function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

for (const file of walk(site)) {
  const dot = file.lastIndexOf('.');
  const ext = dot >= 0 ? file.slice(dot) : '';
  if (!textExt.has(ext) && !file.endsWith('.webmanifest')) continue;
  const text = readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(text)) throw new Error(`Término no permitido ${pattern} en ${relative(root, file)}`);
  }
}

for (const file of ['js/model.js', 'js/storage.js', 'js/exporters.js', 'js/app.js', 'service-worker.js']) {
  const result = spawnSync(process.execPath, ['--check', join(site, file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Error de sintaxis en site/${file}:\n${result.stderr}`);
}

JSON.parse(readFileSync(join(site, 'manifest.webmanifest'), 'utf8'));
JSON.parse(readFileSync(join(site, 'pfmea-project.schema.json'), 'utf8'));
JSON.parse(readFileSync(join(site, 'pfmea-completion-rules.json'), 'utf8'));

const sw = readFileSync(join(site, 'service-worker.js'), 'utf8');
const shell = [...sw.matchAll(/'\.\/(.*?)'/g)].map((match) => match[1]).filter(Boolean);
for (const item of shell) {
  if (item === '') continue;
  if (!existsSync(join(site, item))) throw new Error(`El service worker intenta cachear un archivo inexistente: ${item}`);
}

console.log('Validación correcta: sitio completo, JavaScript válido y sin términos del proyecto de trabajo.');
