import type { NameFormattingConfig } from "@/lib/types/testimonies";

// Prefixes to remove from names
const PREFIXES_TO_REMOVE = [
  "sister",
  "sis.",
  "sis",
  "brother",
  "bro.",
  "bro",
  "pastor",
  "pst.",
  "pst",
  "doctor",
  "dr.",
  "dr",
  "reverend",
  "rev.",
  "rev",
  "minister",
  "min.",
  "min",
  "elder",
  "eld.",
  "eld",
  "deacon",
  "dcn.",
  "dcn",
  "deaconess",
  "dcns.",
  "dcns",
  "apostle",
  "prophet",
  "evangelist",
  "bishop",
  "mrs.",
  "mrs",
  "mr.",
  "mr",
  "ms.",
  "ms",
  "miss",
];

/**
 * Clean a name by removing common titles/prefixes
 */
export function cleanName(name: string): string {
  if (!name) return "";

  let cleanedName = name.trim();

  // Check each prefix and remove if found at the start
  for (const prefix of PREFIXES_TO_REMOVE) {
    const regex = new RegExp(`^${prefix}\\s+`, "i");
    if (regex.test(cleanedName)) {
      cleanedName = cleanedName.replace(regex, "");
      break; // Only remove one prefix
    }
  }

  return cleanedName.trim();
}

/**
 * Format name for display: "FirstName L."
 * Returns first name and last initial with period
 */
export function formatDisplayName(name: string): string {
  if (!name) return "";

  const cleanedName = cleanName(name);
  const parts = cleanedName.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const lastInitial = lastName.charAt(0).toUpperCase();

  return `${firstName} ${lastInitial}.`;
}

/**
 * Format name using default logic: "FirstName L."
 * Same as formatDisplayName but ensures proper capitalization
 */
function formatNameDefault(name: string): string {
  const displayName = formatDisplayName(name);
  if (!displayName) return "";

  // Capitalize first letter of first name
  const parts = displayName.split(" ");
  if (parts.length > 0) {
    parts[0] =
      parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  }

  return parts.join(" ");
}

/**
 * Format name using regex pattern
 */
function formatNameRegex(name: string, pattern: string): string {
  try {
    const regex = new RegExp(pattern, "i");
    const match = name.match(regex);
    if (match && match[0]) {
      return match[0].trim();
    }
    // Fallback to default if regex doesn't match
    return formatNameDefault(name);
  } catch (error) {
    console.error("Invalid regex pattern:", error);
    // Fallback to default on error
    return formatNameDefault(name);
  }
}

/**
 * Format name using JavaScript function
 */
function formatNameJavaScript(name: string, functionCode: string): string {
  try {
    // Create a safe function context
    const func = new Function("name", functionCode);
    const result = func(name);
    if (typeof result === "string") {
      return result.trim();
    }
    // Fallback to default if function doesn't return string
    return formatNameDefault(name);
  } catch (error) {
    console.error("Error executing JavaScript function:", error);
    // Fallback to default on error
    return formatNameDefault(name);
  }
}

/**
 * Format name for copy button and LIVE based on configuration
 * THIS IS THE FUNCTION USED WHEN SETTING LIVE TESTIMONY
 */
export function formatNameForCopy(
  name: string,
  config?: NameFormattingConfig
): string {
  if (!name) return "";

  // If no config or default type, use default logic
  if (!config || config.type === "default") {
    return formatNameDefault(name);
  }

  // Use custom logic based on type
  if (config.type === "regex" && config.customLogic) {
    return formatNameRegex(name, config.customLogic);
  }

  if (config.type === "javascript" && config.customLogic) {
    return formatNameJavaScript(name, config.customLogic);
  }

  // Fallback to default
  return formatNameDefault(name);
}
