// Avvio unico per la prova locale: backend FastAPI (porta 8000) + frontend Expo web.
// Uso: npm run dev -- --port 7100   (gli argomenti --host/--port sono passati a Expo)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiDir = path.join(root, 'services', 'api');
const venvPython = path.join(root, '.venv', 'Scripts', 'python.exe');
const python = existsSync(venvPython) ? venvPython : 'python';

const children = [];
// Modelli OCR docling scaricati in locale (una tantum): la rotta di estrazione
// rifiuta il download automatico, quindi puntiamo l'env alla cache condivisa.
const doclingModels = path.join(process.env.USERPROFILE || '', '.cache', 'docling', 'models');
const apiEnv = { ...process.env };
if (!apiEnv.DOCLING_ARTIFACTS_PATH && existsSync(doclingModels)) {
  apiEnv.DOCLING_ARTIFACTS_PATH = doclingModels;
}

function run(name, cmd, args, cwd, useShell = false, env) {
  const command = useShell ? [cmd, ...args].join(' ') : cmd;
  const child = spawn(command, useShell ? [] : args, { cwd, stdio: 'inherit', shell: useShell, env: env || process.env });
  child.on('exit', (code) => {
    console.log(`[dev] ${name} terminato (codice ${code}). Spengo tutto.`);
    process.exit(code ?? 0);
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const c of children) {
    try { c.kill('SIGTERM'); } catch { /* già terminato */ }
  }
}
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });

// Argomenti passati dopo `--` (es. --port 7100 --host localhost) vanno a Expo.
const passthrough = process.argv.slice(2);

run('backend (uvicorn :8000)', python, ['-m', 'uvicorn', 'formazione_api.main:app', '--host', '127.0.0.1', '--port', '8000'], apiDir, false, apiEnv);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
run('frontend (expo web)', npx, ['expo', 'start', 'apps/learner', '--web', ...passthrough], root, process.platform === 'win32');
