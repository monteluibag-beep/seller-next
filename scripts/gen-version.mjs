import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const version = Date.now().toString();
const publicDir = join(__dirname, '..', 'public');

writeFileSync(join(publicDir, 'version.json'), JSON.stringify({ version }));
console.log(`[gen-version] version = ${version}`);
