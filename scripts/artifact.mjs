// Turns the single-file build into a bare page body (title/meta/style/script at top)
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist-single/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const keep = head
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>/gi, '');
writeFileSync('dist-single/luach.html', keep.trim() + '\n' + body.trim() + '\n');
console.log('wrote dist-single/luach.html');
