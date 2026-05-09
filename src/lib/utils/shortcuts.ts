// src/lib/utils/shortcuts.ts
// Global keyboard shortcut handling. Registered once at app boot.
// Ignored when focus is in text input or modifier keys are held.

import { endpointStore } from '../stores/endpoints';
import { uiStore } from '../stores/ui';
import type { ActiveView } from '../types';
import { get } from 'svelte/store';

const VIEW_SHORTCUTS: Readonly<Record<number, ActiveView>> = {
  0: 'overview',
  1: 'live',
  2: 'diagnose',
};

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

function hasSystemModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

function digitIndexFromEvent(e: KeyboardEvent): number | null {
  const fromCode = /^Digit([0-9])$/.exec(e.code);
  const digit = fromCode?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
  if (digit === null) return null;
  return digit === '0' ? 9 : Number(digit) - 1;
}

function handleKeydown(e: KeyboardEvent): void {
  // Ignore when typing in text fields
  if (isTextInput(e.target)) return;

  // Ignore browser / OS command chords. Alt is reserved below for endpoint
  // toggles so plain number keys can match the visible ViewSwitcher contract.
  if (hasSystemModifier(e)) return;

  const key = e.key;

  switch (key) {
    case 'Escape': {
      const ui = get(uiStore);
      if (ui.showKeyboardHelp) {
        uiStore.toggleKeyboardHelp();
        e.preventDefault();
      } else if (ui.showSettings) {
        uiStore.toggleSettings();
        e.preventDefault();
      } else if (ui.showShare) {
        uiStore.toggleShare();
        e.preventDefault();
      } else if (ui.showEndpoints) {
        uiStore.toggleEndpoints();
        e.preventDefault();
      } else if (ui.focusedEndpointId !== null) {
        uiStore.setFocusedEndpoint(null);
        e.preventDefault();
      }
      break;
    }

    case '?': {
      if (e.altKey) return;
      uiStore.toggleKeyboardHelp();
      e.preventDefault();
      break;
    }

    default: {
      const index = digitIndexFromEvent(e);
      if (index === null) return;

      if (e.altKey) {
        toggleEndpointAtIndex(index);
        e.preventDefault();
        return;
      }

      const view = VIEW_SHORTCUTS[index];
      if (view) {
        uiStore.setActiveView(view);
        e.preventDefault();
      }
      break;
    }
  }
}

function toggleEndpointAtIndex(index: number): void {
  const endpoints = get(endpointStore);
  const target = endpoints[index];
  if (!target) return;
  endpointStore.updateEndpoint(target.id, { enabled: !target.enabled });
}

let registered = false;

/**
 * Register global keyboard shortcuts. Idempotent — safe to call multiple times.
 * Returns a cleanup function that removes the listener.
 */
export function initShortcuts(): () => void {
  if (registered) return () => undefined;
  registered = true;

  document.addEventListener('keydown', handleKeydown);

  return () => {
    document.removeEventListener('keydown', handleKeydown);
    registered = false;
  };
}
