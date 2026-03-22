/**
 * useBibleTranslations
 * 
 * Manages Bible translation loading, filtering, selection,
 * and translation cue detection from transcriptions.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { BibleTranslationSummary } from "@/lib/types/bible";
import type { SmartVersesSettings } from "@/lib/types/smartVerses";
import {
  BUILTIN_KJV_ID,
  getAvailableTranslations,
  getTranslationById,
  resolveTranslationToken,
} from "@/lib/services/bibleLibraryService";
import { saveSmartVersesSettings } from "@/lib/services/transcriptionService";
import { filterTranslationsByQuery } from "@/lib/utils/smartVersesHelpers";

interface UseBibleTranslationsOptions {
  settings: SmartVersesSettings;
  setSettings: React.Dispatch<React.SetStateAction<SmartVersesSettings>>;
}

export function useBibleTranslations({ settings, setSettings }: UseBibleTranslationsOptions) {
  const [availableTranslations, setAvailableTranslations] = useState<BibleTranslationSummary[]>([]);
  const [transcriptionTranslationId, setTranscriptionTranslationId] = useState<string>(BUILTIN_KJV_ID);
  const transcriptionTranslationIdRef = useRef<string>(BUILTIN_KJV_ID);
  const lastDefaultTranslationIdRef = useRef<string>(BUILTIN_KJV_ID);

  // Dropdown/picker state
  const [translationDropdownOpen, setTranslationDropdownOpen] = useState(false);
  const [translationDropdownQuery, setTranslationDropdownQuery] = useState("");
  const [inlineTranslationOverride, setInlineTranslationOverride] = useState<string | null>(null);
  const [searchTranslationPickerOpen, setSearchTranslationPickerOpen] = useState(false);
  const [searchTranslationPickerQuery, setSearchTranslationPickerQuery] = useState("");
  const [verseCardPickerRefId, setVerseCardPickerRefId] = useState<string | null>(null);
  const [verseCardPickerQuery, setVerseCardPickerQuery] = useState("");
  const [activeTranslationCueId, setActiveTranslationCueId] = useState<string | null>(null);

  // Refs for dropdowns
  const translationMenuRef = useRef<HTMLDivElement | null>(null);
  const searchTranslationTagRef = useRef<HTMLDivElement | null>(null);
  const verseCardPickerContainerRef = useRef<HTMLDivElement | null>(null);

  const searchTranslationId = settings.defaultBibleTranslationId || BUILTIN_KJV_ID;

  // Load translations
  const loadTranslations = useCallback(async () => {
    try {
      const list = await getAvailableTranslations();
      setAvailableTranslations(list);
    } catch (error) {
      console.warn("[SmartVerses] Failed to load translations:", error);
      setAvailableTranslations([]);
    }
  }, []);

  useEffect(() => {
    loadTranslations();
    const handleRefresh = () => loadTranslations();
    window.addEventListener("bible-library-refreshed", handleRefresh);
    return () => window.removeEventListener("bible-library-refreshed", handleRefresh);
  }, [loadTranslations]);

  // Validate translations against settings
  useEffect(() => {
    if (!availableTranslations.length) return;
    const ids = new Set(availableTranslations.map((t) => t.id));
    const defaultId = settings.defaultBibleTranslationId || BUILTIN_KJV_ID;
    const safeDefault = ids.has(defaultId) ? defaultId : BUILTIN_KJV_ID;

    if (defaultId !== safeDefault) {
      setSettings((prev) => {
        const next = { ...prev, defaultBibleTranslationId: safeDefault };
        saveSmartVersesSettings(next);
        window.dispatchEvent(
          new CustomEvent("smartverses-settings-changed", { detail: next })
        );
        return next;
      });
    }

    const lastDefault = lastDefaultTranslationIdRef.current;
    if (
      !ids.has(transcriptionTranslationId) ||
      transcriptionTranslationId === lastDefault
    ) {
      setTranscriptionTranslationId(safeDefault);
    }

    lastDefaultTranslationIdRef.current = safeDefault;
  }, [
    availableTranslations,
    transcriptionTranslationId,
    settings.defaultBibleTranslationId,
    setSettings,
  ]);

  // Keep ref in sync
  useEffect(() => {
    transcriptionTranslationIdRef.current = transcriptionTranslationId;
  }, [transcriptionTranslationId]);

  // Clear cue if translation matches default
  useEffect(() => {
    const defaultId = settings.defaultBibleTranslationId || BUILTIN_KJV_ID;
    if (activeTranslationCueId && transcriptionTranslationId === defaultId) {
      setActiveTranslationCueId(null);
    }
  }, [activeTranslationCueId, settings.defaultBibleTranslationId, transcriptionTranslationId]);

  // Computed values
  const translationOptions = useMemo<BibleTranslationSummary[]>(() => {
    if (availableTranslations.length > 0) return availableTranslations;
    return [
      {
        id: BUILTIN_KJV_ID,
        shortName: "KJV",
        fullName: "King James Version",
        language: "en",
        isBuiltin: true,
      },
    ];
  }, [availableTranslations]);

  const translationsById = useMemo(() => {
    const map = new Map<string, BibleTranslationSummary>();
    translationOptions.forEach((translation) => {
      map.set(translation.id, translation);
    });
    return map;
  }, [translationOptions]);

  const filteredTranslationOptions = useMemo(
    () => filterTranslationsByQuery(translationDropdownQuery, translationOptions),
    [translationDropdownQuery, translationOptions]
  );

  const filteredSearchTranslationOptions = useMemo(
    () => filterTranslationsByQuery(searchTranslationPickerQuery, translationOptions),
    [searchTranslationPickerQuery, translationOptions]
  );

  const filteredVerseCardTranslationOptions = useMemo(
    () => filterTranslationsByQuery(verseCardPickerQuery, translationOptions),
    [verseCardPickerQuery, translationOptions]
  );

  const getTranslationLabel = useCallback(
    (translationId?: string) => {
      if (!translationId) return "";
      const translation = translationsById.get(translationId);
      return translation?.shortName || translationId.toUpperCase();
    },
    [translationsById]
  );

  const activeTranslationCueLabel = useMemo(() => {
    if (!activeTranslationCueId) return "";
    const translation = translationsById.get(activeTranslationCueId);
    return (
      translation?.fullName ||
      translation?.shortName ||
      activeTranslationCueId.toUpperCase()
    );
  }, [activeTranslationCueId, translationsById]);

  const resolveTranslationShortName = useCallback(
    async (translationId?: string): Promise<string | null> => {
      if (!translationId) return null;
      try {
        const translation = await getTranslationById(translationId);
        return translation?.shortName || translationId.toUpperCase();
      } catch (error) {
        console.warn("[SmartVerses] Failed to load translation metadata:", error);
        return translationId.toUpperCase();
      }
    },
    []
  );

  const formatReferenceWithTranslation = useCallback(
    (
      referenceText: string,
      translationShortName?: string | null,
      enabled?: boolean
    ): string => {
      if (!enabled || !translationShortName) return referenceText;
      const trimmed = referenceText.trim();
      if (!trimmed) return referenceText;
      const suffix = ` (${translationShortName})`;
      return trimmed.endsWith(suffix) ? referenceText : `${trimmed}${suffix}`;
    },
    []
  );

  const handleDefaultTranslationChange = useCallback((translationId: string) => {
    setSettings((prev) => {
      if (prev.defaultBibleTranslationId === translationId) return prev;
      const next = { ...prev, defaultBibleTranslationId: translationId };
      saveSmartVersesSettings(next);
      window.dispatchEvent(
        new CustomEvent("smartverses-settings-changed", { detail: next })
      );
      return next;
    });
  }, [setSettings]);

  return {
    availableTranslations,
    transcriptionTranslationId,
    setTranscriptionTranslationId,
    transcriptionTranslationIdRef,
    lastDefaultTranslationIdRef,
    translationDropdownOpen,
    setTranslationDropdownOpen,
    translationDropdownQuery,
    setTranslationDropdownQuery,
    inlineTranslationOverride,
    setInlineTranslationOverride,
    searchTranslationPickerOpen,
    setSearchTranslationPickerOpen,
    searchTranslationPickerQuery,
    setSearchTranslationPickerQuery,
    verseCardPickerRefId,
    setVerseCardPickerRefId,
    verseCardPickerQuery,
    setVerseCardPickerQuery,
    activeTranslationCueId,
    setActiveTranslationCueId,
    translationMenuRef,
    searchTranslationTagRef,
    verseCardPickerContainerRef,
    searchTranslationId,
    translationOptions,
    translationsById,
    filteredTranslationOptions,
    filteredSearchTranslationOptions,
    filteredVerseCardTranslationOptions,
    getTranslationLabel,
    activeTranslationCueLabel,
    resolveTranslationShortName,
    formatReferenceWithTranslation,
    handleDefaultTranslationChange,
    resolveTranslationToken,
  };
}
