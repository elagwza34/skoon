const fs = require('fs');
const p = 'src/lib/staff-waiter-operations.ts';
const l = fs.readFileSync(p, 'utf8').split('\n');
let o = 0, c = 0;
for (let i = 0; i < l.length; i++) {
  o += (l[i].match(/{/g) || []).length;
  c += (l[i].match(/}/g) || []).length;
}
console.log('open=' + o + ' close=' + c);
