/**
 * ProPresenter AI Templates Utility
 * 
 * Manages AI-specific templates for displaying content directly on ProPresenter.
 * These templates define file paths for text output and corresponding presentation triggers.
 */

import type { ProPresenterAITemplate, ProPresenterAITemplateUseCase } from "@/lib/types/globalChat";
import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "proassist-propresenter-ai-templates";

/**
 * Load ProPresenter AI templates from localStorage
 */
export function loadProPresenterAITemplates(): ProPresenterAITemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log(`[ProPresenter AI Templates] Loading templates from localStorage. Raw data exists: ${!!stored}`);
    if (stored) {
      const templates = JSON.parse(stored);
      console.log(`[ProPresenter AI Templates] Loaded ${templates.length} template(s):`, templates.map((t: ProPresenterAITemplate) => t.name));
      return templates;
    }
  } catch (error) {
    console.error("[ProPresenter AI Templates] Failed to load templates:", error);
  }
  console.log("[ProPresenter AI Templates] No templates found in localStorage");
  return [];
}

/**
 * Save ProPresenter AI templates to localStorage
 */
export function saveProPresenterAITemplates(templates: ProPresenterAITemplate[]): void {
  try {
    const jsonData = JSON.stringify(templates);
    localStorage.setItem(STORAGE_KEY, jsonData);
    console.log(`[ProPresenter AI Templates] Saved ${templates.length} template(s):`, templates.map(t => t.name));
    
    // Verify the save worked by reading it back
    const verification = localStorage.getItem(STORAGE_KEY);
    if (verification !== jsonData) {
      console.error("[ProPresenter AI Templates] WARNING: Save verification failed - data mismatch!");
    } else {
      console.log("[ProPresenter AI Templates] Save verified successfully");
    }
  } catch (error) {
    console.error("[ProPresenter AI Templates] Failed to save templates:", error);
  }
}

/**
 * Add a new ProPresenter AI template
 */
export function addProPresenterAITemplate(template: Omit<ProPresenterAITemplate, "id">): ProPresenterAITemplate {
  const templates = loadProPresenterAITemplates();
  const newTemplate: ProPresenterAITemplate = {
    ...template,
    id: generateTemplateId(),
  };
  templates.push(newTemplate);
  saveProPresenterAITemplates(templates);
  return newTemplate;
}

/**
 * Update an existing ProPresenter AI template
 */
export function updateProPresenterAITemplate(template: ProPresenterAITemplate): boolean {
  const templates = loadProPresenterAITemplates();
  const index = templates.findIndex((t) => t.id === template.id);
  if (index !== -1) {
    templates[index] = template;
    saveProPresenterAITemplates(templates);
    return true;
  }
  return false;
}

/**
 * Delete a ProPresenter AI template
 */
export function deleteProPresenterAITemplate(id: string): boolean {
  const templates = loadProPresenterAITemplates();
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length !== templates.length) {
    saveProPresenterAITemplates(filtered);
    return true;
  }
  return false;
}

/**
 * Get a template by ID
 */
export function getProPresenterAITemplateById(id: string): ProPresenterAITemplate | undefined {
  const templates = loadProPresenterAITemplates();
  const found = templates.find((t) => t.id === id);
  console.log(`[ProPresenter AI Templates] getProPresenterAITemplateById("${id}"): ${found ? `Found "${found.name}"` : "Not found"}`);
  return found;
}

/**
 * Find the best matching template for a given use case and content
 * The AI uses this to auto-select templates based on content analysis
 */
export function findBestMatchingTemplate(
  content: string,
  useCase?: ProPresenterAITemplateUseCase,
  lineCount?: number
): ProPresenterAITemplate | undefined {
  const templates = loadProPresenterAITemplates();
  
  if (templates.length === 0) {
    return undefined;
  }

  // If use case is specified, filter by it
  let candidates = useCase
    ? templates.filter((t) => t.useCase === useCase)
    : templates;

  // If no candidates match use case, use all templates
  if (candidates.length === 0) {
    candidates = templates;
  }

  // Calculate line count from content if not provided
  const contentLines = lineCount ?? content.split("\n").length;

  // Find templates that can accommodate the content
  const suitableTemplates = candidates.filter((t) => t.maxLines >= contentLines);

  // Prefer the template with the closest maxLines to avoid wasted space
  if (suitableTemplates.length > 0) {
    suitableTemplates.sort((a, b) => a.maxLines - b.maxLines);
    return suitableTemplates[0];
  }

  // If no template can fit, return the one with most lines
  candidates.sort((a, b) => b.maxLines - a.maxLines);
  return candidates[0];
}

/**
 * Find template by name (case-insensitive partial match)
 */
export function findTemplateByName(name: string): ProPresenterAITemplate | undefined {
  const templates = loadProPresenterAITemplates();
  const lowerName = name.toLowerCase();
  
  // Exact match first
  const exact = templates.find((t) => t.name.toLowerCase() === lowerName);
  if (exact) {
    console.log(`[ProPresenter AI Templates] findTemplateByName("${name}"): Found exact match "${exact.name}"`);
    return exact;
  }
  
  // Partial match
  const partial = templates.find((t) => t.name.toLowerCase().includes(lowerName));
  if (partial) {
    console.log(`[ProPresenter AI Templates] findTemplateByName("${name}"): Found partial match "${partial.name}"`);
    return partial;
  }
  
  // Also try matching against description for more flexibility
  const descMatch = templates.find((t) => t.description.toLowerCase().includes(lowerName));
  if (descMatch) {
    console.log(`[ProPresenter AI Templates] findTemplateByName("${name}"): Found description match "${descMatch.name}"`);
    return descMatch;
  }
  
  console.log(`[ProPresenter AI Templates] findTemplateByName("${name}"): No match found. Available: ${templates.map(t => t.name).join(", ") || "none"}`);
  return undefined;
}

/**
 * Get templates formatted for AI context
 */
export function getTemplatesForAIContext(): Array<{
  id: string;
  name: string;
  description: string;
  useCase: string;
  maxLines: number;
}> {
  return loadProPresenterAITemplates().map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    useCase: t.useCase,
    maxLines: t.maxLines,
  }));
}

/**
 * Generate a unique template ID
 */
function generateTemplateId(): string {
  return `pp-ai-tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Write text to a file path using the same Tauri invoke command as Go Live
 * This ensures consistent permissions and behavior
 */
export async function writeTextToFile(filePath: string, text: string): Promise<boolean> {
  console.log(`[ProPresenter AI Templates] writeTextToFile called with:`, { filePath, textLength: text?.length });
  
  // Validate inputs
  if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
    console.error("[ProPresenter AI Templates] Invalid file path:", filePath);
    return false;
  }
  
  if (text === undefined || text === null) {
    console.error("[ProPresenter AI Templates] Invalid text content:", text);
    return false;
  }
  
  try {
    // Use the exact same invoke call as Go Live in MainApplicationPage.tsx
    // invoke is imported at the top level from @tauri-apps/api/core
    console.log(`[ProPresenter AI Templates] Calling invoke("write_text_to_file") with:`, { 
      filePath: filePath, 
      contentPreview: text.substring(0, 50) + (text.length > 50 ? '...' : '')
    });
    
    await invoke("write_text_to_file", { filePath: filePath, content: text });
    console.log(`[ProPresenter AI Templates] Successfully wrote to file: ${filePath}`);
    return true;
  } catch (error: any) {
    console.error("[ProPresenter AI Templates] Failed to write text to file:", {
      filePath,
      error: error?.message || error,
      errorType: typeof error,
      errorString: String(error)
    });
    return false;
  }
}

/**
 * Use case display names for UI
 */
export const USE_CASE_LABELS: Record<ProPresenterAITemplateUseCase, string> = {
  "lower-third": "Lower Third / Name Title",
  "prayer": "Prayer Points",
  "scripture": "Scripture / Bible Verse",
  "announcement": "Announcement",
  "points-3line": "3-Line Points",
  "points-6line": "6-Line Points",
  "custom": "Custom",
};
