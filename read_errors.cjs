const fs = require('fs');
const content = fs.readFileSync('build_errors.txt', 'utf16le');
const lines = content.split('\n');
const missing = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Error:') && lines[i].includes('not exported by')) {
     missing.push(lines[i].trim());
     missing.push(lines[i+1]?.trim());
     missing.push(lines[i+2]?.trim());
     missing.push(lines[i+3]?.trim());
     missing.push("");
  }
}
console.log(missing.join('\n'));
