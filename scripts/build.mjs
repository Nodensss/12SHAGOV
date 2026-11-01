import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canReadSource } from '../public/content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicPath = path.join(root, 'public');
const data = JSON.parse(await readFile(path.join(publicPath, 'data/content.json'), 'utf8'));
const sources = JSON.parse(await readFile(path.join(publicPath, 'data/sources.json'), 'utf8'));
const sourceMap = new Map(sources.map(source=>[source.id,source]));
if (data.steps.length !== 12) throw new Error('Контент должен содержать 12 шагов');
if ([...data.steps,...data.passages].some(item => {
  const source=sourceMap.get(item.sourceId);
  return !canReadSource(source,true)||!canReadSource({...source,...item},true);
})) {
  throw new Error('Черновые и внутренние тексты не должны входить в поисковую выдачу');
}
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await mkdir(path.join(root, 'dist'), { recursive: true });
await cp(publicPath, path.join(root, 'dist'), { recursive: true });
const files = await readdir(path.join(root, 'dist'));
if (files.includes('docs') || files.includes('outputs')) throw new Error('Исходный архив не должен быть в сборке');
console.log('Готово: dist/. Исходная библиотека docs/ остаётся за пределами веб-сборки.');
