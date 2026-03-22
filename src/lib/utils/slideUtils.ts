import type { Slide } from "@/lib/types";

/**
 * Formats an array of slides into a single string for clipboard export.
 * Each slide's text is preserved (including its internal newlines).
 * Slides are separated by a newline, a space, and another newline.
 *
 * @param slides An array of slide objects (or objects with a 'text' property).
 * @returns A single string with all slide texts concatenated and separated.
 */
export const formatSlidesForClipboard = (
  slides: Pick<Slide, "text">[]
): string => {
  if (!slides || slides.length === 0) {
    return "";
  }
  return slides.map((slide) => slide.text).join("\n\n");
};
