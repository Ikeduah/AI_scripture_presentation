import type { FirebaseConfig } from "@/lib/types/testimonies";

/**
 * Parses Firebase configuration from environment variable format
 * Example:
 * NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
 * NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
 */
function parseEnvFormat(text: string): Partial<FirebaseConfig> | null {
  const config: Partial<FirebaseConfig> = {};
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Match KEY=VALUE format
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes

    // Map environment variable names to FirebaseConfig fields
    if (key.includes("API_KEY") || key.includes("apiKey")) {
      config.apiKey = value;
    } else if (key.includes("AUTH_DOMAIN") || key.includes("authDomain")) {
      config.authDomain = value;
    } else if (key.includes("DATABASE_URL") || key.includes("databaseURL")) {
      config.databaseURL = value;
    } else if (key.includes("PROJECT_ID") || key.includes("projectId")) {
      config.projectId = value;
    } else if (key.includes("STORAGE_BUCKET") || key.includes("storageBucket")) {
      config.storageBucket = value;
    } else if (key.includes("MESSAGING_SENDER_ID") || key.includes("messagingSenderId")) {
      config.messagingSenderId = value;
    } else if (key.includes("APP_ID") || key.includes("appId")) {
      config.appId = value;
    }
  }

  return Object.keys(config).length > 0 ? config : null;
}

/**
 * Parses Firebase configuration from JavaScript object format
 * Example:
 * const firebaseConfig = {
 *   apiKey: "...",
 *   authDomain: "...",
 *   ...
 * };
 */
function parseJsObjectFormat(text: string): Partial<FirebaseConfig> | null {
  try {
    // Try to extract the object from the text
    // Match: const firebaseConfig = { ... } or firebaseConfig = { ... }
    const objectMatch = text.match(/(?:const\s+)?(?:firebaseConfig|config)\s*=\s*({[\s\S]*?});?/);
    if (!objectMatch) {
      // Try to match just the object literal
      const objectLiteralMatch = text.match(/{[\s\S]*}/);
      if (!objectLiteralMatch) return null;
      const objectStr = objectLiteralMatch[0];
      
      // Replace single quotes with double quotes for JSON parsing
      const jsonStr = objectStr
        .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":') // Add quotes to keys
        .replace(/:([^,}\]]+)/g, (match, value) => {
          const trimmed = value.trim();
          // If it's already a quoted string, keep it
          if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
              (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return match;
          }
          // Otherwise, add quotes
          return `:"${trimmed.replace(/"/g, '\\"')}"`;
        });
      
      try {
        const parsed = JSON.parse(jsonStr);
        return parsed as Partial<FirebaseConfig>;
      } catch {
        // Fallback: manual parsing
        return parseJsObjectManual(objectStr);
      }
    }

    const objectStr = objectMatch[1];
    return parseJsObjectManual(objectStr);
  } catch (error) {
    return null;
  }
}

/**
 * Manually parses JavaScript object string
 */
function parseJsObjectManual(objectStr: string): Partial<FirebaseConfig> | null {
  const config: Partial<FirebaseConfig> = {};

  // More robust regex that handles:
  // - Single quotes, double quotes, or template literals
  // - Escaped quotes
  // - Whitespace variations
  // - Both quoted and unquoted keys
  const patterns = [
    // Quoted keys with quoted values (double quotes)
    /["']([^"']+)["']\s*:\s*["']([^"']+)["']/g,
    // Quoted keys with quoted values (single quotes)
    /["']([^"']+)["']\s*:\s*['"]([^'"]+)['"]/g,
    // Unquoted keys with quoted values
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*["']([^"']+)["']/g,
    // Unquoted keys with single-quoted values
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*['"]([^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(objectStr)) !== null) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes if present
      value = value.replace(/^["']|["']$/g, "");

      // Map to FirebaseConfig fields (case-insensitive)
      const lowerKey = key.toLowerCase();
      if (lowerKey === "apikey" || lowerKey.includes("api_key")) {
        config.apiKey = value;
      } else if (lowerKey === "authdomain" || lowerKey.includes("auth_domain")) {
        config.authDomain = value;
      } else if (lowerKey === "databaseurl" || lowerKey === "database_url" || lowerKey.includes("database")) {
        config.databaseURL = value;
      } else if (lowerKey === "projectid" || lowerKey.includes("project_id")) {
        config.projectId = value;
      } else if (lowerKey === "storagebucket" || lowerKey.includes("storage_bucket")) {
        config.storageBucket = value;
      } else if (lowerKey === "messagingsenderid" || lowerKey.includes("messaging_sender_id")) {
        config.messagingSenderId = value;
      } else if (lowerKey === "appid" || lowerKey.includes("app_id")) {
        config.appId = value;
      }
    }
  }

  return Object.keys(config).length > 0 ? config : null;
}

/**
 * Parses Firebase configuration from either format
 * Supports:
 * 1. Environment variable format (NEXT_PUBLIC_FIREBASE_API_KEY=...)
 * 2. JavaScript object format (const firebaseConfig = { ... })
 */
export function parseFirebaseConfig(text: string): FirebaseConfig | null {
  if (!text || !text.trim()) {
    return null;
  }

  // Try JavaScript object format first (more common)
  let config = parseJsObjectFormat(text);
  
  // If that didn't work, try environment variable format
  if (!config || Object.keys(config).length === 0) {
    config = parseEnvFormat(text);
  }

  if (!config || Object.keys(config).length === 0) {
    return null;
  }

  // Validate that we have at least some required fields
  const requiredFields: (keyof FirebaseConfig)[] = [
    "apiKey",
    "authDomain",
    "databaseURL",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
  ];

  // Check if we have all required fields
  const hasAllFields = requiredFields.every(field => config![field] && config![field]!.trim() !== "");

  if (!hasAllFields) {
    // Return partial config - user can fill in missing fields
    return config as FirebaseConfig;
  }

  return config as FirebaseConfig;
}
