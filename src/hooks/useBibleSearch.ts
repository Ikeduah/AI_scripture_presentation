/**
 * useBibleSearch
 *
 * Manages Bible search logic, chat history, starred references,
 * verse navigation, and input handling.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  SmartVersesSettings,
  SmartVersesChatMessage,
  DetectedBibleReference,
} from "@/lib/types/smartVerses";
import type { AppSettings } from "@/lib/types";
import { BUILTIN_KJV_ID } from "@/lib/services/bibleLibraryService";
import {
  detectAndLookupReferences,
  resetParseContext,
  getVerseNavigation,
  loadVerseByComponents,
} from "@/lib/services/smartVersesBibleService";
import {
  searchBibleWithAI,
  resolveParaphrasedVerses,
} from "@/lib/services/smartVersesAIService";
import { analyzeTranscriptChunkOffline } from "@/lib/services/smartVersesOfflineParaphraseService";
import { searchBibleTextAsReferences } from "@/lib/services/bibleTextSearchService";
import {
  loadChatHistory,
  saveChatHistory,
  loadStarredRefs,
  saveStarredRefs,
} from "@/lib/utils/smartVersesHelpers";

interface UseBibleSearchOptions {
  settings: SmartVersesSettings;
  appSettings: AppSettings;
  searchTranslationId: string;
  inlineTranslationOverride: string | null;
  setInlineTranslationOverride: (v: string | null) => void;
  setTranslationDropdownOpen: (v: boolean) => void;
  setTranslationDropdownQuery: (v: string) => void;
  resolveTranslationToken: (token: string) => Promise<string | null>;
}

export function useBibleSearch({
  settings,
  appSettings,
  searchTranslationId,
  inlineTranslationOverride,
  setInlineTranslationOverride,
  setTranslationDropdownOpen,
  setTranslationDropdownQuery,
  resolveTranslationToken,
}: UseBibleSearchOptions) {
  const [chatHistory, setChatHistory] = useState<SmartVersesChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isAISearchEnabled, setIsAISearchEnabled] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [starredRefs, setStarredRefs] = useState<Set<string>>(() => loadStarredRefs());
  const [autoScrollChatPaused, setAutoScrollChatPaused] = useState(false);

  // UI refs
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatHistoryLengthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Verse navigation state
  const [verseNavigation, setVerseNavigation] = useState<Record<string, {
    hasPrevious: boolean;
    hasNext: boolean;
    previous: { book: string; chapter: number; verse: number; displayRef: string } | null;
    next: { book: string; chapter: number; verse: number; displayRef: string } | null;
  }>>({});

  // Initialize chat history
  useEffect(() => {
    setChatHistory(loadChatHistory());
  }, []);

  // Save chat history when it changes
  useEffect(() => {
    saveChatHistory(chatHistory);
  }, [chatHistory]);

  // Save starred refs when they change
  useEffect(() => {
    saveStarredRefs(starredRefs);
  }, [starredRefs]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const prevLen = chatHistoryLengthRef.current;
    const currLen = chatHistory.length;
    if (currLen > prevLen) {
      chatHistoryLengthRef.current = currLen;
      if (!autoScrollChatPaused) {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      chatHistoryLengthRef.current = currLen;
    }
  }, [chatHistory, autoScrollChatPaused]);

  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const resolveReferenceTranslationId = useCallback(
    (ref?: DetectedBibleReference) =>
      ref?.translationId ||
      searchTranslationId ||
      settings.defaultBibleTranslationId ||
      BUILTIN_KJV_ID,
    [searchTranslationId, settings.defaultBibleTranslationId]
  );

  const getStarKey = useCallback(
    (ref: DetectedBibleReference) => {
      const translationId = resolveReferenceTranslationId(ref);
      if (ref.book && ref.chapter && ref.verse) {
        return `${translationId}:${ref.book}:${ref.chapter}:${ref.verse}`;
      }
      return `${translationId}:${(ref.displayRef || ref.reference || "").trim()}`;
    },
    [resolveReferenceTranslationId]
  );

  const toggleStarReference = useCallback((ref: DetectedBibleReference) => {
    const key = getStarKey(ref);
    setStarredRefs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [getStarKey]);

  // Search handler
  const handleSearch = useCallback(async (query: string, overrideTranslationId?: string) => {
    const rawQuery = query.trim();
    if (!rawQuery) return [];

    setAutoScrollChatPaused(false);

    const defaultTranslationId = settings.defaultBibleTranslationId || BUILTIN_KJV_ID;
    let activeTranslationId =
      overrideTranslationId ||
      inlineTranslationOverride ||
      searchTranslationId ||
      defaultTranslationId;
    let normalizedQuery = rawQuery;

    if (!overrideTranslationId && !inlineTranslationOverride) {
      const tokenMatch = rawQuery.match(/(?:^|\s)@([^\s]+)/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        const resolved = await resolveTranslationToken(token);
        if (resolved) {
          activeTranslationId = resolved;
          normalizedQuery = rawQuery.replace(tokenMatch[0], " ").trim();
        }
      }
    }

    if (!normalizedQuery.trim()) return [];

    const queryMessage: SmartVersesChatMessage = {
      id: `query-${Date.now()}`,
      type: "query",
      content: rawQuery,
      timestamp: Date.now(),
    };

    setChatHistory(prev => [...prev, queryMessage]);
    setInputValue("");
    setInlineTranslationOverride(null);
    setTranslationDropdownOpen(false);
    setTranslationDropdownQuery("");
    setIsSearching(true);
    scrollChatToBottom();

    const loadingId = `loading-${Date.now()}`;
    setChatHistory(prev => [...prev, {
      id: loadingId,
      type: "result",
      content: "Searching...",
      timestamp: Date.now(),
      isLoading: true,
    }]);

    let references: DetectedBibleReference[] = [];
    let searchMethod = "direct";

    try {
      references = await detectAndLookupReferences(normalizedQuery, {
        translationId: activeTranslationId,
      });

      if (references.length === 0) {
        if (isAISearchEnabled) {
          const explicitProvider = settings.bibleSearchProvider;
          const provider = explicitProvider || appSettings.defaultAIProvider;
          const model = settings.bibleSearchModel;

          if (explicitProvider === "offline") {
            const offlineAnalysis = await analyzeTranscriptChunkOffline(query, {
              minConfidence: settings.bibleSearchConfidenceThreshold ?? 0.6,
              maxResults: 5,
              candidateLimit: 120,
            });

            if (offlineAnalysis.paraphrasedVerses.length > 0) {
              searchMethod = "offline";
              references = await resolveParaphrasedVerses(
                offlineAnalysis.paraphrasedVerses,
                activeTranslationId
              );
            } else {
              searchMethod = "text";
              references = await searchBibleTextAsReferences(query, 5);
            }
          } else {
            let hasApiKey = false;
            if (provider === 'openrouter') hasApiKey = !!(appSettings as any).openRouterConfig?.apiKey;
            else if (provider === 'groq') hasApiKey = !!(appSettings as any).groqConfig?.apiKey;

            if (provider && hasApiKey) {
              searchMethod = "ai";
              references = await searchBibleWithAI(
                normalizedQuery,
                appSettings,
                provider as 'openrouter' | 'groq',
                model,
                activeTranslationId
              );
            } else {
              searchMethod = "text";
              references = await searchBibleTextAsReferences(
                normalizedQuery,
                5,
                activeTranslationId
              );
            }
          }
        } else {
          searchMethod = "text";
          references = await searchBibleTextAsReferences(normalizedQuery, 5, activeTranslationId);
        }
      }

      setChatHistory(prev => {
        const filtered = prev.filter(m => m.id !== loadingId);
        if (references.length > 0) {
          return [...filtered, {
            id: `result-${Date.now()}`,
            type: "result",
            content: `Found ${references.length} verse${references.length > 1 ? "s" : ""}`,
            timestamp: Date.now(),
            references,
          }];
        } else {
          let errorMsg = "No verses found for your search.";
          const providerForMessage = settings.bibleSearchProvider;
          if (!isAISearchEnabled) {
            errorMsg += " Try enabling AI Search below for better results.";
          } else if (searchMethod === "text" && providerForMessage === "offline") {
            errorMsg += " Offline Search (Experimental) didn't find a match. Try lowering the confidence threshold or switch to an AI provider.";
          } else if (searchMethod === "text") {
            errorMsg += " AI Search is enabled but not configured. Go to Settings → SmartVerses to configure your AI provider.";
          } else {
            errorMsg += " Try a different query or check the spelling.";
          }

          return [...filtered, {
            id: `result-${Date.now()}`,
            type: "result",
            content: errorMsg,
            timestamp: Date.now(),
            error: "No results",
          }];
        }
      });
      scrollChatToBottom();
      return references;
    } catch (error) {
      console.error("Search error:", error);
      setChatHistory(prev => {
        const filtered = prev.filter(m => m.id !== loadingId);
        return [...filtered, {
          id: `error-${Date.now()}`,
          type: "result",
          content: "An error occurred while searching.",
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : "Unknown error",
        }];
      });
      scrollChatToBottom();
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [
    appSettings,
    inlineTranslationOverride,
    isAISearchEnabled,
    searchTranslationId,
    settings,
    scrollChatToBottom,
    setInlineTranslationOverride,
    setTranslationDropdownOpen,
    setTranslationDropdownQuery,
    resolveTranslationToken,
  ]);

  // Reference translation change
  const handleReferenceTranslationChange = useCallback(
    async (ref: DetectedBibleReference, translationId: string) => {
      if (!ref.book || !ref.chapter || !ref.verse) return;
      const verseData = await loadVerseByComponents(ref.book, ref.chapter, ref.verse, translationId);
      if (!verseData) return;

      const updated: DetectedBibleReference = {
        ...ref,
        reference: verseData.displayRef,
        displayRef: verseData.displayRef,
        verseText: verseData.verseText,
        translationId,
      };

      setChatHistory((prev) =>
        prev.map((msg) => {
          if (!msg.references) return msg;
          return {
            ...msg,
            references: msg.references.map((item) =>
              item.id === ref.id ? updated : item
            ),
          };
        })
      );

      return updated;
    },
    []
  );

  const addReferenceToChatHistory = useCallback((ref: DetectedBibleReference, label?: string) => {
    const isParaphrase = ref.source === "paraphrase";
    const fallbackLabel = isParaphrase ? "Paraphrase added to chat" : "Reference added to chat";
    setChatHistory((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        type: "result",
        content: label || fallbackLabel,
        timestamp: Date.now(),
        references: [ref],
      },
    ]);
  }, []);

  // Input handling
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    const match = value.match(/@([^\s]*)$/);
    if (match) {
      setTranslationDropdownOpen(true);
      setTranslationDropdownQuery(match[1] || "");
    } else {
      setTranslationDropdownOpen(false);
      setTranslationDropdownQuery("");
    }
  }, [setTranslationDropdownOpen, setTranslationDropdownQuery]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch(inputValue);
    }
  }, [handleSearch, inputValue]);

  const handleClearHistory = useCallback(() => {
    if (window.confirm("Clear all chat history?")) {
      setChatHistory([]);
      resetParseContext();
    }
  }, []);

  // Chat scroll handler
  const handleChatScroll = useCallback(() => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const atBottom = distanceFromBottom < 60;

    if (!atBottom && !autoScrollChatPaused) {
      setAutoScrollChatPaused(true);
      return;
    }

    if (atBottom && autoScrollChatPaused) {
      setAutoScrollChatPaused(false);
    }
  }, [autoScrollChatPaused]);

  // Verse navigation
  const loadNavigationInfo = useCallback(async (ref: DetectedBibleReference) => {
    if (!ref.book || !ref.chapter || !ref.verse) return;
    const translationId = resolveReferenceTranslationId(ref);
    const navKey = `${translationId}-${ref.book}-${ref.chapter}-${ref.verse}`;
    if (verseNavigation[navKey]) return;

    const nav = await getVerseNavigation(ref.book, ref.chapter, ref.verse, translationId);
    setVerseNavigation(prev => ({ ...prev, [navKey]: nav }));
  }, [resolveReferenceTranslationId, verseNavigation]);

  const handlePreviousVerse = useCallback(async (ref: DetectedBibleReference, messageId: string) => {
    if (!ref.book || !ref.chapter || !ref.verse) return;
    const translationId = resolveReferenceTranslationId(ref);
    const navKey = `${translationId}-${ref.book}-${ref.chapter}-${ref.verse}`;
    const nav = verseNavigation[navKey];
    if (!nav?.previous) return;

    const prevVerse = await loadVerseByComponents(
      nav.previous.book, nav.previous.chapter, nav.previous.verse, translationId
    );

    if (prevVerse) {
      const newRef: DetectedBibleReference = {
        id: `nav-prev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        reference: prevVerse.displayRef,
        displayRef: prevVerse.displayRef,
        verseText: prevVerse.verseText,
        source: 'direct',
        timestamp: Date.now(),
        translationId,
        book: prevVerse.book,
        chapter: prevVerse.chapter,
        verse: prevVerse.verse,
        isNavigationResult: true,
      };

      setChatHistory(prev => prev.map(msg => {
        if (msg.id === messageId && msg.references) {
          return { ...msg, references: [newRef, ...msg.references] };
        }
        return msg;
      }));
    }
  }, [resolveReferenceTranslationId, verseNavigation]);

  const handleNextVerse = useCallback(async (ref: DetectedBibleReference, messageId: string) => {
    if (!ref.book || !ref.chapter || !ref.verse) return;
    const translationId = resolveReferenceTranslationId(ref);
    const navKey = `${translationId}-${ref.book}-${ref.chapter}-${ref.verse}`;
    const nav = verseNavigation[navKey];
    if (!nav?.next) return;

    const nextVerse = await loadVerseByComponents(
      nav.next.book, nav.next.chapter, nav.next.verse, translationId
    );

    if (nextVerse) {
      const newRef: DetectedBibleReference = {
        id: `nav-next-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        reference: nextVerse.displayRef,
        displayRef: nextVerse.displayRef,
        verseText: nextVerse.verseText,
        source: 'direct',
        timestamp: Date.now(),
        translationId,
        book: nextVerse.book,
        chapter: nextVerse.chapter,
        verse: nextVerse.verse,
        isNavigationResult: true,
      };

      setChatHistory(prev => prev.map(msg => {
        if (msg.id === messageId && msg.references) {
          return { ...msg, references: [...msg.references, newRef] };
        }
        return msg;
      }));
    }
  }, [resolveReferenceTranslationId, verseNavigation]);

  // Displayed chat history (filtered by stars)
  const displayedChatHistory = useMemo(() => {
    if (!showStarredOnly) return chatHistory;
    const filtered: SmartVersesChatMessage[] = [];
    for (const msg of chatHistory) {
      if (msg.type !== "result" || !msg.references) continue;
      const starredOnly = msg.references.filter((ref) => starredRefs.has(getStarKey(ref)));
      if (starredOnly.length === 0) continue;
      filtered.push({ ...msg, references: starredOnly });
    }
    return filtered;
  }, [chatHistory, showStarredOnly, starredRefs, getStarKey]);

  return {
    chatHistory,
    setChatHistory,
    inputValue,
    setInputValue,
    isAISearchEnabled,
    setIsAISearchEnabled,
    isSearching,
    showStarredOnly,
    setShowStarredOnly,
    starredRefs,
    autoScrollChatPaused,
    chatScrollContainerRef,
    chatEndRef,
    inputRef,
    scrollChatToBottom,
    resolveReferenceTranslationId,
    getStarKey,
    toggleStarReference,
    handleSearch,
    handleReferenceTranslationChange,
    addReferenceToChatHistory,
    handleInputChange,
    handleInputKeyDown,
    handleClearHistory,
    handleChatScroll,
    displayedChatHistory,
    // Verse navigation
    verseNavigation,
    loadNavigationInfo,
    handlePreviousVerse,
    handleNextVerse,
  };
}
