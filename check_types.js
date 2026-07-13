const fs = require('fs');
const buf = fs.readFileSync('src/types/index.ts');
console.log('File size:', buf.length);
console.log('BOM:', buf[0] === 0xEF ? 'YES' : 'NO');
const text = buf.toString('utf8');
const lines = text.split('\n');
console.log('Total lines:', lines.length);
let isDefaultCount = 0;
let incomeCount = 0;
let gitaCount = 0;
lines.forEach((l, i) => {
  if (l.includes('isDefault')) isDefaultCount++;
  if (l.includes("type: 'income'")) incomeCount++;
  if (l.includes('기타수입')) gitaCount++;
});
console.log('isDefault lines:', isDefaultCount);
console.log('income lines:', incomeCount);
console.log('기타수입 lines:', gitaCount);

// Check for 기타수입 as group
lines.forEach((l, i) => {
  if (l.includes('기타수입')) {
    console.log(`  Line ${i+1}: ${l.trim().substring(0, 80)}`);
  }
});
