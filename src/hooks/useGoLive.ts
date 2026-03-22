/**
 * useGoLive
 *
 * Manages "Go Live" / "Off Live" functionality for sending
 * verses to display windows, files, and ProPresenter.
 */

import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  SmartVersesSettings,
  DetectedBibleReference,
  SmartVersesChatMessage,
} from "@/lib/types/smartVerses";
import {
  loadDisplaySettings,
  openDisplayWindow,
  sendScriptureToDisplay,
} from "@/lib/services/displayService";
import { triggerPresentationOnConnections } from "@/lib/services/propresenterService";

interface UseGoLiveOptions {
  settings: SmartVersesSettings;
  setChatHistory: React.Dispatch<React.SetStateAction<SmartVersesChatMessage[]>>;
  resolveTranslationShortName: (id?: string) => Promise<string | null>;
  formatReferenceWithTranslation: (ref: string, shortName?: string | null, enabled?: boolean) => string;
}

export function useGoLive({
  settings,
  setChatHistory,
  resolveTranslationShortName,
  formatReferenceWithTranslation,
}: UseGoLiveOptions) {
  const [liveReferenceId, setLiveReferenceId] = useState<string | null>(null);
  const autoClearTimeoutRef = useRef<number | null>(null);

  const handleGoLive = useCallback(async (
    reference: DetectedBibleReference,
    options?: { fromAutoTrigger?: boolean; fromChatHistory?: boolean }
  ) => {
    console.log("Going live with:", reference);

    setLiveReferenceId(reference.id);

    try {
      if (autoClearTimeoutRef.current != null) {
        window.clearTimeout(autoClearTimeoutRef.current);
        autoClearTimeoutRef.current = null;
      }

      const basePath = settings.bibleOutputPath?.replace(/\/?$/, "/") || "";
      const verseText = reference.verseText || "";
      const displayRef = reference.displayRef || "";
      const translationShortName = await resolveTranslationShortName(
        reference.translationId
      );

      const displaySettings = loadDisplaySettings();
      const outputReference = formatReferenceWithTranslation(
        displayRef,
        translationShortName,
        settings.appendTranslationToReference
      );
      const shouldUpdateDisplay =
        displaySettings.enabled ||
        displaySettings.webEnabled ||
        displaySettings.windowAudienceScreen;
      if (shouldUpdateDisplay) {
        if (displaySettings.enabled) {
          try {
            await openDisplayWindow(displaySettings);
          } catch (error) {
            console.warn("[Display] Failed to open audience screen:", error);
          }
        }
        try {
          await sendScriptureToDisplay({
            verseText,
            reference: displayRef,
            translationShortName: translationShortName || undefined,
          });
        } catch (error) {
          console.warn("[Display] Failed to update audience screen:", error);
        }
      }

      // Write verse text to file
      if (basePath && settings.bibleTextFileName) {
        const textFilePath = `${basePath}${settings.bibleTextFileName}`;
        try {
          await invoke("write_text_to_file", {
            filePath: textFilePath,
            content: verseText,
          });
        } catch (error) {
          console.warn("[SmartVerses] Failed to write verse text file:", error);
        }
      }

      // Write reference to file
      if (basePath && settings.bibleReferenceFileName) {
        const refFilePath = `${basePath}${settings.bibleReferenceFileName}`;
        try {
          await invoke("write_text_to_file", {
            filePath: refFilePath,
            content: outputReference,
          });
        } catch (error) {
          console.warn("[SmartVerses] Failed to write reference file:", error);
        }
      }

      // Trigger ProPresenter if configured
      if (settings.proPresenterActivation) {
        const { presentationUuid, slideIndex, activationClicks } = settings.proPresenterActivation;
        const clicks = activationClicks ?? 1;
        try {
          await triggerPresentationOnConnections(
            { presentationUuid, slideIndex },
            settings.proPresenterConnectionIds,
            clicks,
            100
          );
        } catch (error) {
          console.warn("[SmartVerses] Failed to trigger ProPresenter:", error);
        }
      }

      // Add "Went live" to chat history when not triggered from chat history
      if (!options?.fromChatHistory) {
        setChatHistory(prev => [...prev, {
          id: `live-${Date.now()}`,
          type: "system",
          content: `Went live: ${reference.displayRef}`,
          timestamp: Date.now(),
        }]);
      }

      // Auto-clear text after delay
      const clearDelay = settings.clearTextDelay ?? 0;
      if (settings.clearTextAfterLive && basePath && clearDelay > 0) {
        autoClearTimeoutRef.current = window.setTimeout(async () => {
          try {
            if (settings.bibleTextFileName) {
              try {
                await invoke("write_text_to_file", {
                  filePath: `${basePath}${settings.bibleTextFileName}`,
                  content: "",
                });
              } catch (error) {
                console.warn("[SmartVerses] Failed to auto-clear verse text file:", error);
              }
            }
            if (settings.bibleReferenceFileName) {
              try {
                await invoke("write_text_to_file", {
                  filePath: `${basePath}${settings.bibleReferenceFileName}`,
                  content: "",
                });
              } catch (error) {
                console.warn("[SmartVerses] Failed to auto-clear reference file:", error);
              }
            }
            const ds = loadDisplaySettings();
            if (ds.enabled || ds.webEnabled || ds.windowAudienceScreen) {
              try {
                await sendScriptureToDisplay({ verseText: "", reference: "" });
              } catch (error) {
                console.warn("[Display] Failed to auto-clear audience screen:", error);
              }
            }
          } finally {
            setLiveReferenceId(null);
            autoClearTimeoutRef.current = null;
          }
        }, clearDelay);
      }
    } catch (error) {
      console.error("Error going live:", error);
    }
  }, [formatReferenceWithTranslation, resolveTranslationShortName, settings, setChatHistory]);

  const handleOffLive = useCallback(async () => {
    console.log("Taking off live");

    try {
      if (autoClearTimeoutRef.current != null) {
        window.clearTimeout(autoClearTimeoutRef.current);
        autoClearTimeoutRef.current = null;
      }

      const basePath = settings.bibleOutputPath?.replace(/\/?$/, "/") || "";

      if (settings.proPresenterActivation?.clearTextFileOnTakeOff !== false) {
        if (basePath && settings.bibleTextFileName) {
          try {
            await invoke("write_text_to_file", {
              filePath: `${basePath}${settings.bibleTextFileName}`,
              content: "",
            });
          } catch (error) {
            console.warn("[SmartVerses] Failed to clear verse text file:", error);
          }
        }

        if (basePath && settings.bibleReferenceFileName) {
          try {
            await invoke("write_text_to_file", {
              filePath: `${basePath}${settings.bibleReferenceFileName}`,
              content: "",
            });
          } catch (error) {
            console.warn("[SmartVerses] Failed to clear reference file:", error);
          }
        }
      }

      const displaySettings = loadDisplaySettings();
      if (displaySettings.enabled || displaySettings.webEnabled || displaySettings.windowAudienceScreen) {
        try {
          await sendScriptureToDisplay({ verseText: "", reference: "" });
        } catch (error) {
          console.warn("[Display] Failed to clear audience screen:", error);
        }
      }

      if (settings.proPresenterActivation) {
        const { presentationUuid, slideIndex, takeOffClicks } = settings.proPresenterActivation;
        const clicks = takeOffClicks ?? 0;
        if (clicks > 0) {
          try {
            await triggerPresentationOnConnections(
              { presentationUuid, slideIndex },
              settings.proPresenterConnectionIds,
              clicks,
              100
            );
          } catch (error) {
            console.warn("[SmartVerses] Failed to trigger ProPresenter take off:", error);
          }
        }
      }

      setLiveReferenceId(null);
    } catch (error) {
      console.error("Error taking off live:", error);
    }
  }, [settings]);

  return {
    liveReferenceId,
    setLiveReferenceId,
    handleGoLive,
    handleOffLive,
  };
}
