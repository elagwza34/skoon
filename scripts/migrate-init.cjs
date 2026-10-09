const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
try {
  const out = execFileSync(process.execPath, [prismaCli, 'migrate', 'dev', '--name', 'init', '--schema', 'prisma/schema.prisma'], { cwd: root, stdio: 'pipe', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 });
  console.log(out);
  process.exitCode = 0;
} catch (e) {
  process.stdout.write(String((e && e.stdout) || ''));
  process.stderr.write(String((e && e.stderr) || (e && e.message) || e));
  process.exitCode = typeof e.status === 'number' ? e.status : 1;
}
