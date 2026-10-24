// Prints the Android accessibility tree (what TalkBack and UI automation see) of the current screen.
//   node scripts/android/ui-dump.mjs [--device emulator-5554]
import { execFileSync } from 'node:child_process';

const device = process.argv.includes('--device')
  ? process.argv[process.argv.indexOf('--device') + 1]
  : 'emulator-5554';
const adb = (...a) =>
  execFileSync('adb', ['-s', device, ...a], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).replace(/\r/g, '');

adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
const xml = adb('exec-out', 'cat', '/sdcard/ui.xml');
const pick = (n, k) => (new RegExp(`${k}="([^"]*)"`).exec(n) ?? ['', ''])[1];
for (const node of xml.matchAll(/<node [^>]*>/g)) {
  const n = node[0];
  const text = pick(n, 'text');
  const desc = pick(n, 'content-desc');
  const cls = pick(n, 'class').split('.').pop();
  if (!text && !desc && !/EditText|Button/.test(cls)) continue;
  console.log(
    cls.padEnd(14),
    `text=${JSON.stringify(text)}`.padEnd(36),
    `desc=${JSON.stringify(desc)}`.padEnd(30),
    `password=${pick(n, 'password')} clickable=${pick(n, 'clickable')} focusable=${pick(n, 'focusable')}`,
    pick(n, 'bounds'),
  );
}
