import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const provenance: { files: { path: string; sha256: string }[] } = JSON.parse(readFileSync(resolve(root, 'provenance.json'), 'utf8').replace(/^\uFEFF/, ''));

describe('Civis original files integrity', () => {
  it('records exactly the seven extracted files', () => expect(provenance.files).toHaveLength(7));
  it.each(provenance.files)('$path matches the extracted SHA256', ({ path, sha256 }) => {
    expect(createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')).toBe(sha256);
  });
});
