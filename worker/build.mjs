import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';

// Bundle the source notes, never backend/.env or the local embedding vectors.
const directory = new URL('../rag/knowledge/', import.meta.url);
const files = (await readdir(directory)).filter(f => f.endsWith('.md')).sort();
const notes = [];
let chunks = 0;
for (const file of files) {
  const text = await readFile(new URL(file, directory), 'utf8');
  notes.push(text);
  chunks += (text.match(/^## /gm) || []).length;
}
if (!chunks) throw new Error('Knowledge base is empty');
await mkdir(new URL('src/', import.meta.url), { recursive: true });
await writeFile(new URL('src/knowledge.json', import.meta.url), JSON.stringify({ chunks, text: notes.join('\n\n') }));
console.log(`Bundled ${chunks} sections from ${files.length} knowledge files`);
