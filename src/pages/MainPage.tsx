import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type {
  SmartVersesChatMessage,
  DetectedBibleReference,
  KeyPoint,
} from "@/lib/types/smartVerses";

// Hooks
import { useSmartVersesSettings } from "@/hooks/useSmartVersesSettings";
import { useBibleTranslations } from "@/hooks/useBibleTranslations";
import { useBibleSearch } from "@/hooks/useBibleSearch";
import { useGoLive } from "@/hooks/useGoLive";
import { useParaphraseDetection } from "@/hooks/useParaphraseDetection";
import { useTranscription } from "@/hooks/useTranscription";
import { useTranscriptDisplay } from "@/hooks/useTranscriptDisplay";

// Components
import { BibleSearchPanel } from "@/components/smartverses/BibleSearchPanel";
import { TranscriptionPanel } from "@/components/smartverses/TranscriptionPanel";
import TranscriptionLimitPrompt from "@/components/smartverses/TranscriptionLimitPrompt";
import ReportConfirmDialog from "@/components/smartverses/ReportConfirmDialog";

const MainPage: React.FC = () => {
  const navigate = useNavigate();

  // 1. Settings
  const {
    settings,
    setSettings,
    appSettings,
    settingsRef,
    autoTriggerOnDetectionRef,
    reloadSettings,
  } = useSmartVersesSettings();

  // 2. Local State shared across hooks
  const [detectedReferences, setDetectedReferences] = useState<DetectedBibleReference[]>([]);
  const detectedReferencesRef = useRef<DetectedBibleReference[]>([]);
  useEffect(() => {
    detectedReferencesRef.current = detectedReferences;
  }, [detectedReferences]);

  const [chatHistory, setChatHistory] = useState<SmartVersesChatMessage[]>([]);
  const [transcriptKeyPoints, setTranscriptKeyPoints] = useState<Record<string, KeyPoint[]>>({});
  
  // 3. Translations
  const bibleTranslations = useBibleTranslations({
    settings,
    setSettings,
  });

  const transcriptionTranslationIdRef = useRef<string>(bibleTranslations.transcriptionTranslationId);
  useEffect(() => {
    transcriptionTranslationIdRef.current = bibleTranslations.transcriptionTranslationId;
  }, [bibleTranslations.transcriptionTranslationId]);

  // 4. Go Live
  const goLive = useGoLive({
    settings,
    setChatHistory,
    resolveTranslationShortName: bibleTranslations.resolveTranslationShortName,
    formatReferenceWithTranslation: bibleTranslations.formatReferenceWithTranslation,
  });

  // 5. Paraphrase Detection
  const paraphraseDetection = useParaphraseDetection({
    settingsRef,
    autoTriggerOnDetectionRef,
    detectedReferencesRef,
    transcriptionTranslationIdRef,
    setDetectedReferences,
    setChatHistory,
    setTranscriptKeyPoints,
    handleGoLive: goLive.handleGoLive,
  });

  // 6. Transcription
  const transcription = useTranscription({
    settings,
    appSettings,
    settingsRef,
    autoTriggerOnDetectionRef,
    transcriptionTranslationIdRef,
    setDetectedReferences,
    detectedReferencesRef,
    setChatHistory,
    handleGoLive: goLive.handleGoLive,
    handleTranslationCue: async (id) => bibleTranslations.setActiveTranslationCueId(id),
    aiContextChunksRef: paraphraseDetection.aiContextChunksRef,
    applyParaphraseDetections: paraphraseDetection.applyParaphraseDetections,
    updateAiContextChunks: paraphraseDetection.updateAiContextChunks,
    runParaphraseDetection: paraphraseDetection.runParaphraseDetection,
  });

  // 7. Transcript Display
  const transcriptDisplay = useTranscriptDisplay({
    transcriptHistory: transcription.transcriptHistory,
    interimTranscript: transcription.interimTranscript,
    detectedReferences,
    transcriptKeyPoints,
  });

  // 8. Bible Search
  const bibleSearch = useBibleSearch({
    settings,
    appSettings,
    searchTranslationId: bibleTranslations.searchTranslationId,
    inlineTranslationOverride: bibleTranslations.inlineTranslationOverride,
    setInlineTranslationOverride: bibleTranslations.setInlineTranslationOverride,
    setTranslationDropdownOpen: bibleTranslations.setTranslationDropdownOpen,
    setTranslationDropdownQuery: bibleTranslations.setTranslationDropdownQuery,
    resolveTranslationToken: bibleTranslations.resolveTranslationToken,
  });

  // Derived state & Callbacks
  const handleOpenSmartVersesSettings = () => navigate("/settings?tab=smartverses");

  // Render
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      backgroundColor: "var(--app-bg-color)",
      padding: "var(--spacing-4)",
      gap: "var(--spacing-4)",
      boxSizing: "border-box",
    }}>
      <BibleSearchPanel
        settings={settings}
        appSettings={appSettings}
        liveReferenceId={goLive.liveReferenceId}
        handleOffLive={goLive.handleOffLive}
        showStarredOnly={bibleSearch.showStarredOnly}
        setShowStarredOnly={bibleSearch.setShowStarredOnly}
        handleClearHistory={bibleSearch.handleClearHistory}
        chatScrollContainerRef={bibleSearch.chatScrollContainerRef}
        handleChatScroll={bibleSearch.handleChatScroll}
        displayedChatHistory={bibleSearch.displayedChatHistory}
        renderReferencesWithNavigation={(refs, id, g) => null /* Placeholder till fixed later */}
        chatEndRef={bibleSearch.chatEndRef}
        inlineTranslationOverride={bibleTranslations.inlineTranslationOverride}
        setInlineTranslationOverride={bibleTranslations.setInlineTranslationOverride}
        getTranslationLabel={bibleTranslations.getTranslationLabel}
        inputRef={bibleSearch.inputRef}
        inputValue={bibleSearch.inputValue}
        handleInputChange={bibleSearch.handleInputChange}
        handleInputKeyDown={bibleSearch.handleInputKeyDown}
        isSearching={bibleSearch.isSearching}
        handleSearch={bibleSearch.handleSearch}
        setTranslationDropdownOpen={bibleTranslations.setTranslationDropdownOpen}
        translationDropdownOpen={bibleTranslations.translationDropdownOpen}
        searchTranslationPickerOpen={bibleTranslations.searchTranslationPickerOpen}
        setSearchTranslationPickerOpen={bibleTranslations.setSearchTranslationPickerOpen}
        searchTranslationPickerQuery={bibleTranslations.searchTranslationPickerQuery}
        setSearchTranslationPickerQuery={bibleTranslations.setSearchTranslationPickerQuery}
        searchTranslationTagRef={bibleTranslations.searchTranslationTagRef}
        searchTranslationId={bibleTranslations.searchTranslationId}
        filteredSearchTranslationOptions={bibleTranslations.filteredSearchTranslationOptions}
        handleDefaultTranslationChange={bibleTranslations.handleDefaultTranslationChange}
        translationMenuRef={bibleTranslations.translationMenuRef}
        filteredTranslationOptions={bibleTranslations.filteredTranslationOptions}
        translationDropdownQuery={bibleTranslations.translationDropdownQuery}
        handleSelectTranslationToken={(token) => {
          const match = bibleSearch.inputValue.match(/@([^\s]*)$/);
          if (match) {
            const newValue = bibleSearch.inputValue.substring(0, match.index) + `@${token} `;
            bibleSearch.handleInputChange(newValue);
            bibleSearch.inputRef.current?.focus();
          } else {
            bibleSearch.handleInputChange(bibleSearch.inputValue + ` @${token} `);
            bibleSearch.inputRef.current?.focus();
          }
        }}
        isAISearchEnabled={bibleSearch.isAISearchEnabled}
        setIsAISearchEnabled={bibleSearch.setIsAISearchEnabled}
        translationsById={bibleTranslations.translationsById}
      />

      <TranscriptionPanel
        settings={settings}
        appSettings={appSettings}
        transcriptionStatus={transcription.transcriptionStatus}
        formattedElapsedTime={transcription.formattedElapsedTime}
        canStartTranscription={transcription.canStartTranscription}
        handleStartTranscription={transcription.handleStartTranscription}
        handleStopTranscription={transcription.handleStopTranscription}
        isStopping={transcription.isStopping}
        transcriptMenuOpen={transcriptDisplay.transcriptMenuOpen}
        setTranscriptMenuOpen={transcriptDisplay.setTranscriptMenuOpen}
        transcriptMenuRef={transcriptDisplay.transcriptMenuRef}
        transcriptSearchQuery={transcriptDisplay.transcriptSearchQuery}
        setTranscriptSearchQuery={transcriptDisplay.setTranscriptSearchQuery}
        transcriptDisplayOptions={transcriptDisplay.transcriptDisplayOptions}
        handleToggleTranscriptOption={transcriptDisplay.handleToggleTranscriptOption}
        handleClearTranscript={transcription.handleClearTranscript}
        handleDownloadTranscript={transcriptDisplay.handleDownloadTranscript}
        handleOpenSmartVersesSettings={handleOpenSmartVersesSettings}
        transcriptionErrorMessage={transcription.transcriptionErrorMessage}
        audioLevel={transcription.audioLevel}
        autoScrollTranscript={transcriptDisplay.autoScrollTranscript}
        setAutoScrollFromCheckbox={transcriptDisplay.setAutoScrollFromCheckbox}
        autoScrollPaused={transcriptDisplay.autoScrollPaused}
        handleAutoTriggerToggle={(v) => { /* settings hook logic here */ }}
        transcriptScrollContainerRef={transcriptDisplay.transcriptScrollContainerRef}
        handleTranscriptScroll={transcriptDisplay.handleTranscriptScroll}
        transcriptHistory={transcription.transcriptHistory}
        interimTranscript={transcription.interimTranscript}
        filteredTranscriptHistory={transcriptDisplay.filteredTranscriptHistory}
        matchesInterimSearch={transcriptDisplay.matchesInterimSearch}
        transcriptEndRef={transcriptDisplay.transcriptEndRef}
        detectedReferences={detectedReferences}
        transcriptKeyPoints={transcriptKeyPoints}
        reportedSegmentIds={transcriptDisplay.reportedSegmentIds}
        loadingReportSegmentId={transcriptDisplay.loadingReportSegmentId}
        handleReportSegment={transcriptDisplay.handleReportSegment}
        liveReferenceId={goLive.liveReferenceId}
        handleGoLive={goLive.handleGoLive}
        handleOffLive={goLive.handleOffLive}
        expandedInlineRefIds={transcriptDisplay.expandedInlineRefIds}
        toggleInlineExpanded={transcriptDisplay.toggleInlineExpanded}
        activeTranslationCueId={bibleTranslations.activeTranslationCueId}
        activeTranslationCueLabel={bibleTranslations.activeTranslationCueLabel}
        clearActiveTranslationCue={() => bibleTranslations.setActiveTranslationCueId(null)}
        detectedPanelScrollRef={transcription.detectedPanelScrollRef}
        handleDetectedScroll={transcription.handleDetectedScroll}
        detectedPanelCollapsed={transcription.detectedPanelCollapsed}
        setDetectedPanelCollapsed={transcription.setDetectedPanelCollapsed}
        recentDetectedReferences={transcription.recentDetectedReferences}
        expandedDetectedIds={transcription.expandedDetectedIds}
        toggleDetectedExpanded={transcription.toggleDetectedExpanded}
        addReferenceToChatHistory={bibleSearch.addReferenceToChatHistory}
      />

      <TranscriptionLimitPrompt
        show={false}
        formattedElapsedTime={transcription.formattedElapsedTime}
        transcriptionLimitLabel="1 hr"
        transcriptionTimeLimitMinutes={60}
        onSnooze={() => {}}
        onStop={transcription.handleStopTranscription}
      />

      <ReportConfirmDialog
        show={!!transcriptDisplay.pendingReportConfirmSegmentId}
        onConfirm={transcriptDisplay.handleReportConfirm}
        onCancel={transcriptDisplay.handleReportCancel}
      />
    </div>
  );
};

export default MainPage;
