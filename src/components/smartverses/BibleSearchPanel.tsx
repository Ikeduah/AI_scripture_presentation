import React from "react";
import { FaSearch, FaStar, FaRegStar, FaTrash, FaRobot, FaStopCircle, FaBroadcastTower, FaPaperPlane } from "react-icons/fa";
import type {
  SmartVersesSettings,
  SmartVersesChatMessage,
  DetectedBibleReference,
} from "@/lib/types/smartVerses";
import type { AppSettings } from "@/lib/types";
import type { BibleTranslationSummary } from "@/lib/types/bible";
import DOMPurify from "dompurify";
import { marked } from "marked";

interface BibleSearchPanelProps {
  settings: SmartVersesSettings;
  appSettings: AppSettings;
  liveReferenceId: string | null;
  handleOffLive: () => void;
  showStarredOnly: boolean;
  setShowStarredOnly: React.Dispatch<React.SetStateAction<boolean>>;
  handleClearHistory: () => void;
  chatScrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleChatScroll: () => void;
  displayedChatHistory: SmartVersesChatMessage[];
  renderReferencesWithNavigation: (refs: DetectedBibleReference[], messageId: string, showGoLive?: boolean) => React.ReactNode;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  inlineTranslationOverride: string | null;
  setInlineTranslationOverride: (v: string | null) => void;
  getTranslationLabel: (id: string) => string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputValue: string;
  handleInputChange: (v: string) => void;
  handleInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  handleSearch: (v: string) => void;
  setTranslationDropdownOpen: (v: boolean) => void;
  translationDropdownOpen: boolean;
  searchTranslationPickerOpen: boolean;
  setSearchTranslationPickerOpen: (v: boolean) => void;
  searchTranslationPickerQuery: string;
  setSearchTranslationPickerQuery: (v: string) => void;
  searchTranslationTagRef: React.RefObject<HTMLDivElement | null>;
  searchTranslationId: string;
  filteredSearchTranslationOptions: BibleTranslationSummary[];
  handleDefaultTranslationChange: (id: string) => void;
  translationMenuRef: React.RefObject<HTMLDivElement | null>;
  filteredTranslationOptions: BibleTranslationSummary[];
  translationDropdownQuery: string;
  handleSelectTranslationToken: (token: string) => void;
  isAISearchEnabled: boolean;
  setIsAISearchEnabled: (v: boolean) => void;
  translationsById: Map<string, BibleTranslationSummary>;
}

export const BibleSearchPanel: React.FC<BibleSearchPanelProps> = ({
  settings,
  appSettings,
  liveReferenceId,
  handleOffLive,
  showStarredOnly,
  setShowStarredOnly,
  handleClearHistory,
  chatScrollContainerRef,
  handleChatScroll,
  displayedChatHistory,
  renderReferencesWithNavigation,
  chatEndRef,
  inlineTranslationOverride,
  setInlineTranslationOverride,
  getTranslationLabel,
  inputRef,
  inputValue,
  handleInputChange,
  handleInputKeyDown,
  isSearching,
  handleSearch,
  setTranslationDropdownOpen,
  translationDropdownOpen,
  searchTranslationPickerOpen,
  setSearchTranslationPickerOpen,
  searchTranslationPickerQuery,
  setSearchTranslationPickerQuery,
  searchTranslationTagRef,
  searchTranslationId,
  filteredSearchTranslationOptions,
  handleDefaultTranslationChange,
  translationMenuRef,
  filteredTranslationOptions,
  translationDropdownQuery,
  handleSelectTranslationToken,
  isAISearchEnabled,
  setIsAISearchEnabled,
  translationsById,
}) => {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
    }}>
      {/* Sticky header: Bible Search + translation button */}
      <div style={{
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
        backgroundColor: "var(--app-bg-color)",
        paddingTop: "var(--spacing-2)",
        minHeight: 52,
        boxSizing: "border-box",
      }}>
        {/* Header */}
        <div style={{
          padding: "var(--spacing-3) var(--spacing-4)",
          borderBottom: "1px solid var(--app-border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--app-header-bg)",
          minHeight: 44,
          boxSizing: "border-box",
        }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <FaSearch />
            Bible Search
            <div ref={searchTranslationTagRef} style={{ position: "relative" }}>
              <button
                type="button"
                  onClick={() => {
                    setTranslationDropdownOpen(false);
                    if (!searchTranslationPickerOpen) {
                      setSearchTranslationPickerQuery("");
                      setSearchTranslationPickerOpen(true);
                    } else {
                      setSearchTranslationPickerOpen(false);
                    }
                  }}
                  title={translationsById.get(searchTranslationId)?.fullName ?? searchTranslationId}
                  style={{
                    fontSize: "0.7rem",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    backgroundColor: "var(--app-input-bg-color)",
                    color: "var(--app-text-color-secondary)",
                    fontWeight: 600,
                    border: "1px solid var(--app-border-color)",
                    cursor: "pointer",
                  }}
                >
                  {getTranslationLabel(searchTranslationId)}
                </button>
                {searchTranslationPickerOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      minWidth: "320px",
                      width: "320px",
                      backgroundColor: "var(--app-bg-color)",
                      border: "1px solid var(--app-border-color)",
                      borderRadius: "8px",
                      boxShadow: "0 10px 24px rgba(0, 0, 0, 0.15)",
                      zIndex: 50,
                      maxHeight: "320px",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: "var(--spacing-2)", borderBottom: "1px solid var(--app-border-color)", flexShrink: 0 }}>
                      <input
                        type="text"
                        value={searchTranslationPickerQuery}
                        onChange={(e) => setSearchTranslationPickerQuery(e.target.value)}
                        placeholder="Search translations..."
                        autoFocus
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: "0.9rem",
                          border: "1px solid var(--app-border-color)",
                          borderRadius: "6px",
                          backgroundColor: "var(--app-input-bg-color)",
                          color: "var(--app-input-text-color)",
                          outline: "none",
                        }}
                      />
                    </div>
                    <div style={{ overflowY: "auto", flex: 1, maxHeight: "260px" }}>
                      {filteredSearchTranslationOptions.length === 0 ? (
                        <div
                          style={{
                            padding: "var(--spacing-3)",
                            fontSize: "0.85rem",
                            color: "var(--app-text-color-secondary)",
                          }}
                        >
                          No translations match "{searchTranslationPickerQuery}"
                        </div>
                      ) : (
                        filteredSearchTranslationOptions.map((translation) => (
                          <button
                            key={translation.id}
                            type="button"
                            onClick={() => {
                              handleDefaultTranslationChange(translation.id);
                              setSearchTranslationPickerOpen(false);
                            }}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 12px",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              color: "var(--app-text-color)",
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{translation.shortName}</span>
                            <span style={{ fontSize: "0.8rem", color: "var(--app-text-color-secondary)" }}>
                              {translation.fullName}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", position: "relative" }}>
              {liveReferenceId && (
                <button
                  onClick={handleOffLive}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                  }}
                >
                  <FaStopCircle size={10} />
                  Off Live
                </button>
              )}
              <button
                onClick={() => setShowStarredOnly((prev) => !prev)}
                className="icon-button"
                title={showStarredOnly ? "Show all results" : "Show starred only"}
                style={{
                  padding: "6px",
                  color: showStarredOnly ? "#f59e0b" : undefined,
                }}
              >
                {showStarredOnly ? <FaStar size={12} /> : <FaRegStar size={12} />}
              </button>
              <button
                onClick={handleClearHistory}
                className="icon-button"
                title="Clear history"
                style={{ padding: "6px" }}
              >
                <FaTrash size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Messages - scrollable; only this area scrolls */}
        <div
          ref={chatScrollContainerRef}
          onScroll={handleChatScroll}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "var(--spacing-4)",
          }}
        >
          {displayedChatHistory.length === 0 ? (
            <div style={{
              textAlign: "center",
              color: "var(--app-text-color-secondary)",
              padding: "var(--spacing-8)",
            }}>
              <FaSearch size={32} style={{ marginBottom: "var(--spacing-3)", opacity: 0.5 }} />
              <p>{showStarredOnly ? "No starred scriptures yet" : "Search for Bible verses"}</p>
              <p style={{ fontSize: "0.85rem" }}>
                {showStarredOnly
                  ? "Star a verse card to save it here."
                  : "Type a reference like \"John 3:16\" or a phrase like \"For God so loved\""}
              </p>
            </div>
          ) : (
            displayedChatHistory.map((message) => (
              <div
                key={message.id}
                style={{
                  marginBottom: "var(--spacing-3)",
                }}
              >
                {message.type === "query" && (
                  <div style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginBottom: "var(--spacing-2)",
                  }}>
                    <div style={{
                      backgroundColor: "var(--app-primary-color)",
                      color: "white",
                      padding: "var(--spacing-2) var(--spacing-3)",
                      borderRadius: "12px 12px 0 12px",
                      maxWidth: "80%",
                    }}>
                      {message.content}
                    </div>
                  </div>
                )}
                {message.type === "result" && (
                  <div>
                    {message.isLoading ? (
                      <div style={{
                        padding: "var(--spacing-3)",
                        color: "var(--app-text-color-secondary)",
                        fontStyle: "italic",
                      }}>
                        {message.content}
                      </div>
                    ) : message.references && message.references.length > 0 ? (
                      <>
                        <div style={{
                          fontSize: "0.8rem",
                          color: "var(--app-text-color-secondary)",
                          marginBottom: "var(--spacing-2)",
                        }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(message.content) as string) }} />
                        {renderReferencesWithNavigation(message.references, message.id, true)}
                      </>
                    ) : (
                      <div style={{
                        padding: "var(--spacing-3)",
                        color: message.error ? "var(--error)" : "var(--app-text-color-secondary)",
                      }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(message.content) as string) }} />
                    )}
                  </div>
                )}
                {message.type === "system" && (
                  <div style={{
                    textAlign: "center",
                    fontSize: "0.8rem",
                    color: "var(--app-text-color-secondary)",
                    padding: "var(--spacing-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}>
                    {message.content.startsWith("Went live:") && (
                      <FaBroadcastTower size={12} style={{ flexShrink: 0 }} />
                    )}
                    <span>{message.content}</span>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: "var(--spacing-3) var(--spacing-4)",
          paddingBottom: "var(--spacing-6)",
          borderTop: "1px solid var(--app-border-color)",
          backgroundColor: "var(--app-header-bg)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-2)",
            marginBottom: "var(--spacing-2)",
          }}>
            <div style={{ flex: 1, position: "relative" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  padding: "var(--spacing-2) var(--spacing-3)",
                  borderRadius: "8px",
                  border: "1px solid var(--app-border-color)",
                  backgroundColor: "var(--app-input-bg-color)",
                }}
              >
                {inlineTranslationOverride && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "2px 6px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(59, 130, 246, 0.2)",
                      color: "var(--app-input-text-color)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    @{getTranslationLabel(inlineTranslationOverride)}
                    <button
                      onClick={() => setInlineTranslationOverride(null)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        lineHeight: 1,
                      }}
                      title="Clear translation override"
                    >
                      ×
                    </button>
                  </span>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Search Bible reference or phrase..."
                  disabled={isSearching}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    backgroundColor: "transparent",
                    color: "var(--app-input-text-color)",
                    fontSize: "1rem",
                  }}
                />
              </div>
              {translationDropdownOpen && (
                <div
                  ref={translationMenuRef}
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    backgroundColor: "var(--app-bg-color)",
                    border: "1px solid var(--app-border-color)",
                    borderRadius: "8px",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.15)",
                    zIndex: 40,
                    maxHeight: "220px",
                    overflowY: "auto",
                  }}
                >
                  {filteredTranslationOptions.length === 0 ? (
                    <div
                      style={{
                        padding: "var(--spacing-3)",
                        fontSize: "0.85rem",
                        color: "var(--app-text-color-secondary)",
                      }}
                    >
                      No translations match "{translationDropdownQuery}"
                    </div>
                  ) : (
                    filteredTranslationOptions.map((translation) => (
                      <button
                        key={translation.id}
                        onClick={() => handleSelectTranslationToken(translation.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          color: "var(--app-text-color)",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {translation.shortName}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--app-text-color-secondary)" }}>
                          {translation.fullName}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => handleSearch(inputValue)}
              disabled={!inputValue.trim() || isSearching}
              className="primary"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                padding: 0,
                borderRadius: "50%",
                flexShrink: 0,
              }}
            >
              <FaPaperPlane />
            </button>
          </div>
          <p style={{
            fontSize: "0.75rem",
            color: "var(--app-text-color-secondary)",
            margin: "4px 0 var(--spacing-3) 0",
          }}>
            Type @ to override translation eg @KJV
          </p>
          {/* AI Search Toggle */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--spacing-3)",
          }}>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.85rem",
              cursor: "pointer",
              color: isAISearchEnabled ? "var(--app-primary-color)" : "var(--app-text-color-secondary)",
            }}>
              <input
                type="checkbox"
                checked={isAISearchEnabled}
                onChange={(e) => setIsAISearchEnabled(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <FaRobot size={12} />
              AI Search
            </label>
            {(() => {
              if (!isAISearchEnabled) {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--app-text-color-secondary)",
                  }}>
                    Using text search
                  </span>
                );
              }

              // Check if AI is configured
              const explicitProvider = settings.bibleSearchProvider;
              const provider = explicitProvider || appSettings.defaultAIProvider;
              let hasApiKey = false;
              if (provider === 'openrouter') hasApiKey = !!appSettings.openRouterConfig?.apiKey;
              else if (provider === 'groq') hasApiKey = !!appSettings.groqConfig?.apiKey;

              if (explicitProvider === "offline") {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--success)",
                  }}>
                    ✓ Local on-device search
                  </span>
                );
              } else if (provider && hasApiKey) {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--success)",
                  }}>
                    ✓ {provider} {settings.bibleSearchModel ? `(${settings.bibleSearchModel.split('/').pop()})` : ''}
                  </span>
                );
              } else if (provider && !hasApiKey) {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--warning)",
                  }}>
                    ⚠ {provider} API key missing - Settings → AI Config
                  </span>
                );
              } else {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--warning)",
                  }}>
                    ⚠ Select provider in Settings → SmartVerses
                  </span>
                );
              }
            })()}
          </div>
        </div>
      </div>
  );
};
