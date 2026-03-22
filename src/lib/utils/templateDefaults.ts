/**
 * Default code examples and AI prompt templates for template processing
 */

// Default JavaScript example - Prayer parser
export const DEFAULT_JAVASCRIPT_CODE = `// Parse numbered items with scripture references into 3-layer slides
const lines = input.split('\\n').filter(line => line.trim());
const items = [];
let currentItem = null;

for (const line of lines) {
  const itemMatch = line.match(/^(\\d+)\\.\\s*(.+)/);
  if (itemMatch) {
    if (currentItem) items.push(currentItem);
    currentItem = { number: parseInt(itemMatch[1]), text: itemMatch[2] };
  } else if (currentItem && !line.match(/^Day\\s+\\d+/i)) {
    currentItem.text += ' ' + line.trim();
  }
}
if (currentItem) items.push(currentItem);

return items.map(item => {
  // Extract scripture reference (e.g., "Tit. 1:10-11", "Matt. 13:54")
  const scriptureMatch = item.text.match(/[–-]\\s*((?:\\d\\s+)?[A-Za-z]+\\.?\\s*\\d+[:\\d\\-\\/\\s]*\\d*)[\\s]*$/);
  let itemText = item.text;
  let scriptureRef = '';
  
  if (scriptureMatch) {
    scriptureRef = scriptureMatch[1].trim();
    itemText = item.text.replace(/[–-]\\s*(?:\\d\\s+)?[A-Za-z]+\\.?\\s*\\d+[:\\d\\-\\/\\s]*\\d*[\\s]*$/, '').trim();
  }
  
  return {
    text: 'Prayer ' + item.number + '\\n' + itemText + '\\n' + scriptureRef,
    layout: 'three-line'
  };
});`;

// Default Regex example
export const DEFAULT_REGEX_CODE = `/^\\d+\\.\\s*/gm`;

// Sample input for JavaScript example
export const SAMPLE_JAVASCRIPT_INPUT = `Day 2: Tuesday, 6th January 2026 

1. Father, silence every voice seeking to manipulate people from coming to Christ
and this church this year - Tit. 1:10-11  
2. Father, let there be an outpouring of the spirit of servanthood upon every Winner
this year, thereby positioning us to obtain your favor – Isa. 42:1/4    
3. Father, let your angels wait upon every challenged Winner, drafting them into all
our services for their restoration and breakthroughs – Isa. 51:11`;

// Sample input for Regex example
export const SAMPLE_REGEX_INPUT = `1. First item content here
2. Second item content here
3. Third item content here`;

/**
 * Generate AI prompt for JavaScript template logic
 */
export function generateJavaScriptAIPrompt(userRequirements: string): string {
  return `You are an expert JavaScript developer helping create a text processing function for a presentation software template system.

## Context
The user needs a JavaScript function that processes raw text input and returns an array of slide objects. Each slide can have multiple "layers" (lines) determined by the layout type.

## Available Layout Types
- "one-line" - Single line slide
- "two-line" - Two lines (Layer 1, Layer 2)
- "three-line" - Three lines (Layer 1, Layer 2, Layer 3)
- "four-line" - Four lines
- "five-line" - Five lines
- "six-line" - Six lines

## Function Requirements
The function receives two parameters:
1. \`input\` - The raw text string to process
2. \`layouts\` - Array of available layout types for this template

The function must return an array of objects:
\`\`\`javascript
[
  { text: "Layer 1\\nLayer 2\\nLayer 3", layout: "three-line" },
  // ... more slides
]
\`\`\`

For multi-layer slides, separate each layer with \\n (newline) in the text property.

## User's Requirements
${userRequirements}

## Example Code (Prayer Parser)
This example parses numbered prayers with scripture references into 3-layer slides:
- Layer 1: "Prayer 1", "Prayer 2", etc.
- Layer 2: The prayer text content
- Layer 3: The scripture reference

\`\`\`javascript
${DEFAULT_JAVASCRIPT_CODE}
\`\`\`

## Sample Input for the Example
\`\`\`
${SAMPLE_JAVASCRIPT_INPUT}
\`\`\`

## Your Task
Write a JavaScript function body (not the function declaration) that:
1. Processes the input text according to the user's requirements
2. Returns an array of { text, layout } objects
3. Uses the appropriate layout type for the number of layers needed
4. Handles edge cases gracefully (empty lines, malformed input, etc.)

Return ONLY the JavaScript code, no explanations. The code will be executed as:
\`\`\`javascript
const fn = new Function("input", "layouts", YOUR_CODE);
const result = fn(textInput, availableLayouts);
\`\`\``;
}

/**
 * Generate AI prompt for Regex template logic
 */
export function generateRegexAIPrompt(userRequirements: string): string {
  return `You are an expert in JavaScript regular expressions helping create a text splitting pattern for a presentation software template system.

## Context
The user needs a regex pattern that splits raw text into separate slides. The regex is used with JavaScript's \`String.split(regex)\` method.

## How the Regex is Used
\`\`\`javascript
const regex = new RegExp(pattern, flags);
const slides = text.split(regex).filter(s => s.trim());
\`\`\`

## Important Notes
- The regex SPLITS the text - matched portions are removed and text between matches becomes slides
- Use capture groups if you want to KEEP parts of the matched text
- Common patterns:
  - \`/\\n\\s*\\n/\` - Split by empty lines (paragraphs)
  - \`/^\\d+\\.\\s*/gm\` - Split by numbered items (1. 2. 3.)
  - \`/---+/\` - Split by horizontal rules
  - \`/\\n(?=\\d+\\.)/gm\` - Split before numbered items (lookahead, keeps the number)

## User's Requirements
${userRequirements}

## Example Regex Patterns

### Split by numbered items (removes the numbers):
\`\`\`
/^\\d+\\.\\s*/gm
\`\`\`

### Split by paragraphs (double newlines):
\`\`\`
/\\n\\s*\\n/
\`\`\`

### Split before numbered items (keeps numbers - uses lookahead):
\`\`\`
/\\n(?=\\d+\\.)/gm
\`\`\`

## Sample Input
\`\`\`
${SAMPLE_REGEX_INPUT}
\`\`\`

## Your Task
Write a regex pattern in JavaScript literal format: \`/pattern/flags\`

The pattern should:
1. Split the text according to the user's requirements
2. Handle the input format described
3. Work correctly with JavaScript's split() method

Return ONLY the regex literal (e.g., \`/\\n\\s*\\n/g\`), no explanations or code blocks.`;
}
