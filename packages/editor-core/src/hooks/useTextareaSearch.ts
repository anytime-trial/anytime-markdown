"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface TextareaSearchMatch {
  start: number;
  end: number;
}

export interface TextareaSearchState {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  matches: TextareaSearchMatch[];
  currentIndex: number;
  setSearchTerm: (term: string) => void;
  setReplaceTerm: (term: string) => void;
  toggleCaseSensitive: () => void;
  goToNext: () => void;
  goToPrev: () => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
  focusSearch: () => void;
  reset: () => void;
}

function findMatches(text: string, term: string, caseSensitive: boolean): TextareaSearchMatch[] {
  if (!term) return [];
  const results: TextareaSearchMatch[] = [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? term : term.toLowerCase();
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    results.push({ start: idx, end: idx + needle.length });
    pos = idx + 1;
  }
  return results;
}

export function useTextareaSearch(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  text: string,
  onTextChange: (newText: string) => void,
): TextareaSearchState {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTermState] = useState("");
  const [replaceTerm, setReplaceTermState] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<TextareaSearchMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep a ref to avoid stale closures in callbacks
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const textRef = useRef(text);
  textRef.current = text;
  const searchTermRef = useRef(searchTerm);
  searchTermRef.current = searchTerm;

  // Recalculate matches when text, searchTerm or caseSensitive changes
  useEffect(() => {
    const newMatches = findMatches(text, searchTerm, caseSensitive);
    setMatches(newMatches);
    // Clamp currentIndex
    setCurrentIndex((prev) => {
      if (newMatches.length === 0) return 0;
      return prev >= newMatches.length ? 0 : prev;
    });
  }, [text, searchTerm, caseSensitive]);

  const selectMatch = useCallback((index: number) => {
    const m = matchesRef.current;
    if (m.length === 0) return;
    const match = m[index];
    if (!match) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(match.start, match.end);
    // Scroll textarea to bring selection into view
    const textBefore = textRef.current.substring(0, match.start);
    const linesBefore = textBefore.split("\n").length;
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const targetScroll = (linesBefore - 3) * lineHeight;
    ta.scrollTop = Math.max(0, targetScroll);
  }, [textareaRef]);

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);
  }, []);

  const setReplaceTerm = useCallback((term: string) => {
    setReplaceTermState(term);
  }, []);

  const toggleCaseSensitive = useCallback(() => {
    setCaseSensitive((v) => !v);
  }, []);

  const goToNext = useCallback(() => {
    const m = matchesRef.current;
    if (m.length === 0) return;
    const next = (currentIndexRef.current + 1) % m.length;
    setCurrentIndex(next);
    selectMatch(next);
  }, [selectMatch]);

  const goToPrev = useCallback(() => {
    const m = matchesRef.current;
    if (m.length === 0) return;
    const prev = (currentIndexRef.current - 1 + m.length) % m.length;
    setCurrentIndex(prev);
    selectMatch(prev);
  }, [selectMatch]);

  const replaceCurrent = useCallback(() => {
    const m = matchesRef.current;
    if (m.length === 0) return;
    const idx = currentIndexRef.current;
    const match = m[idx];
    if (!match) return;
    const t = textRef.current;
    const newText = t.substring(0, match.start) + replaceTerm + t.substring(match.end);
    onTextChange(newText);
  }, [replaceTerm, onTextChange]);

  const replaceAll = useCallback(() => {
    const m = matchesRef.current;
    if (m.length === 0) return;
    const term = searchTermRef.current;
    if (!term) return;
    const t = textRef.current;
    // Replace from end to start to preserve indices
    let result = t;
    for (let i = m.length - 1; i >= 0; i--) {
      const match = m[i];
      result = result.substring(0, match.start) + replaceTerm + result.substring(match.end);
    }
    onTextChange(result);
    setCurrentIndex(0);
  }, [replaceTerm, onTextChange]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  const reset = useCallback(() => {
    setSearchTermState("");
    setReplaceTermState("");
    setMatches([]);
    setCurrentIndex(0);
  }, []);

  return {
    searchInputRef,
    searchTerm,
    replaceTerm,
    caseSensitive,
    matches,
    currentIndex,
    setSearchTerm,
    setReplaceTerm,
    toggleCaseSensitive,
    goToNext,
    goToPrev,
    replaceCurrent,
    replaceAll,
    focusSearch,
    reset,
  };
}
