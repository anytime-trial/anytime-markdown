import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SearchReplaceBarProps {
  editor: Editor;
}

export function SearchReplaceBar({ editor }: SearchReplaceBarProps) {
  const storage = editor.storage.searchReplace;

  const [showReplace, setShowReplace] = useState(false);
  const [searchTerm, setSearchTerm] = useState(storage.searchTerm);
  const [replaceTerm, setReplaceTerm] = useState(storage.replaceTerm);
  const [caseSensitive, setCaseSensitive] = useState(storage.caseSensitive);
  const [wholeWord, setWholeWord] = useState(storage.wholeWord);
  const [useRegex, setUseRegex] = useState(storage.useRegex);
  const [resultCount, setResultCount] = useState(storage.results.length);
  const [currentIndex, setCurrentIndex] = useState(storage.currentIndex);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = () => {
      const s = editor.storage.searchReplace;
      setResultCount(s.results.length);
      setCurrentIndex(s.currentIndex);
      setCaseSensitive(s.caseSensitive);
      setWholeWord(s.wholeWord);
      setUseRegex(s.useRegex);
      if (s.isOpen && s.showReplace) {
        setShowReplace(true);
      }
      if (s.isOpen) {
        s.isOpen = false;
        setTimeout(() => searchInputRef.current?.focus(), 50);
        const { from, to } = editor.state.selection;
        if (from !== to) {
          const selectedText = editor.state.doc.textBetween(from, to);
          if (selectedText && selectedText.length < 200 && !selectedText.includes("\n")) {
            setSearchTerm(selectedText);
            editor.commands.setSearchTerm(selectedText);
          }
        }
      }
    };
    storage.onSearchStateChange = handler;
    return () => {
      storage.onSearchStateChange = undefined;
    };
  }, [editor, storage]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        editor.commands.setSearchTerm(value);
      }, 300);
    },
    [editor],
  );

  const handleReplaceChange = useCallback(
    (value: string) => {
      setReplaceTerm(value);
      editor.commands.setReplaceTerm(value);
    },
    [editor],
  );

  const handleClearAndBlur = useCallback(() => {
    setSearchTerm("");
    setReplaceTerm("");
    setShowReplace(false);
    editor.commands.closeSearch();
    editor.commands.focus();
  }, [editor]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          editor.commands.goToPrevMatch();
        } else {
          editor.commands.goToNextMatch();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClearAndBlur();
      }
    },
    [editor, handleClearAndBlur],
  );

  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          handleClearAndBlur();
        }
      }
    },
    [handleClearAndBlur],
  );

  return (
    <>
      <div className="separator" />

      {/* Replace toggle */}
      <button
        className="search-toggle-btn"
        title="Replace"
        onClick={() => setShowReplace((v) => !v)}
      >
        {showReplace ? "\u25BC" : "\u25B6"}
      </button>

      {/* Search + Replace container */}
      <div className="search-container">
        {/* Search input */}
        <input
          ref={searchInputRef}
          className="search-input"
          aria-label="Search"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search..."
        />

        {/* Clear search */}
        {searchTerm && (
          <button
            className="search-clear-btn"
            title="Clear"
            onClick={() => {
              setSearchTerm("");
              editor.commands.setSearchTerm("");
              searchInputRef.current?.focus();
            }}
          >
            \u00D7
          </button>
        )}

        {/* Replace row */}
        {showReplace && (
          <div className="replace-dropdown">
            <input
              className="search-input replace-input"
              aria-label="Replace"
              value={replaceTerm}
              onChange={(e) => handleReplaceChange(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="Replace..."
            />
            <button
              className="replace-action-btn"
              title="Replace"
              onClick={() => editor.commands.replaceCurrentMatch()}
              disabled={resultCount === 0}
            >
              1
            </button>
            <button
              className="replace-action-btn"
              title="Replace All"
              onClick={() => editor.commands.replaceAllMatches()}
              disabled={resultCount === 0}
            >
              *
            </button>
          </div>
        )}
      </div>

      {/* Match count */}
      {searchTerm && (
        <span className={`search-result-count ${resultCount === 0 ? "no-results" : ""}`}>
          {resultCount > 0
            ? `${currentIndex + 1}/${resultCount}`
            : "No results"}
        </span>
      )}

      {/* Toggle buttons */}
      <button
        className={`search-option-btn ${caseSensitive ? "is-active" : ""}`}
        title="Case Sensitive"
        onClick={() => editor.commands.toggleCaseSensitive()}
      >
        Aa
      </button>
      <button
        className={`search-option-btn ${wholeWord && !useRegex ? "is-active" : ""}`}
        title="Whole Word"
        onClick={() => editor.commands.toggleWholeWord()}
        disabled={useRegex}
      >
        Ab|
      </button>
      <button
        className={`search-option-btn ${useRegex ? "is-active" : ""}`}
        title="Regex"
        onClick={() => editor.commands.toggleUseRegex()}
      >
        .*
      </button>

      {/* Prev / Next */}
      <button
        className="search-nav-btn"
        title="Previous Match (Shift+Enter)"
        onClick={() => editor.commands.goToPrevMatch()}
        disabled={resultCount === 0}
      >
        \u25B2
      </button>
      <button
        className="search-nav-btn"
        title="Next Match (Enter)"
        onClick={() => editor.commands.goToNextMatch()}
        disabled={resultCount === 0}
      >
        \u25BC
      </button>

      <div className="separator" />
    </>
  );
}
