const fs = require('fs');
const path = require('path');

const VALUES = new Set([
  'DEFAULT_SMART_VERSES_SETTINGS',
  'SMART_VERSES_SETTINGS_KEY',
  'SMART_VERSES_CHAT_HISTORY_KEY',
  'AVAILABLE_OFFLINE_MODELS',
  'OPENROUTER_MODELS',
  'GROQ_MODELS',
  'RECOMMENDED_DEFAULT_AI_MODEL',
  'GROQ_FIRST_TIME_DEFAULTS',
  'BUILTIN_KJV_ID',
  'BUILTIN_ASV_ID',
]);

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Regex to match multi-line or single-line imports from @/lib/types...
  // import { A, B, C } from "@/lib/types..."
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["'](@\/lib\/types[^"']*)["'];/g;

  content = content.replace(importRegex, (match, importsStr, modulePath) => {
    const names = importsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    
    const types = [];
    const values = [];

    for (const name of names) {
      // Handle aliased imports like `Type as Alias`
      const baseName = name.split(/\s+as\s+/)[0].trim();
      if (VALUES.has(baseName)) {
        values.push(name);
      } else {
        types.push(name);
      }
    }

    let result = '';
    if (types.length > 0) {
      result += `import type { ${types.join(', ')} } from "${modulePath}";\n`;
    }
    if (values.length > 0) {
      result += `import { ${values.join(', ')} } from "${modulePath}";\n`;
    }

    // If there were types mixed, we fixed it. If only types or only values, we just updated the syntax
    return result.trim();
  });

  // Also fix imports using relative paths like `../lib/types/...` or `../../lib/types...`
  const relImportRegex = /import\s+\{([^}]+)\}\s+from\s+["'](\.\.?\/.*lib\/types[^"']*)["'];/g;
  content = content.replace(relImportRegex, (match, importsStr, modulePath) => {
    const names = importsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const types = [];
    const values = [];
    for (const name of names) {
      const baseName = name.split(/\s+as\s+/)[0].trim();
      if (VALUES.has(baseName)) {
        values.push(name);
      } else {
        types.push(name);
      }
    }
    let result = '';
    if (types.length > 0) {
      result += `import type { ${types.join(', ')} } from "${modulePath}";\n`;
    }
    if (values.length > 0) {
      result += `import { ${values.join(', ')} } from "${modulePath}";\n`;
    }
    return result.trim();
  });

  if (content !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed imports in ${filePath}`);
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      fixImportsInFile(fullPath);
    }
  }
}

console.log("Starting bulk import fix...");
walk(path.join(__dirname, 'src'));
console.log("Done.");
