import type React from 'react';

/**
 * Character-insertion helpers behind the German character helper (§17).
 *
 * Kept separate from the component so both the buttons and the keyboard shortcuts share
 * one implementation, and so the component module exports only a component.
 */

export const GERMAN_CHARACTERS = ['ä', 'ö', 'ü', 'Ä', 'Ö', 'Ü', 'ß'] as const;
export type GermanCharacter = (typeof GERMAN_CHARACTERS)[number];

export const CHARACTER_NAMES: Record<GermanCharacter, string> = {
  ä: 'a umlaut',
  ö: 'o umlaut',
  ü: 'u umlaut',
  Ä: 'capital A umlaut',
  Ö: 'capital O umlaut',
  Ü: 'capital U umlaut',
  ß: 'eszett',
};

/** Alt+key shortcuts. Shift selects the capital form. */
const SHORTCUTS: Record<string, { lower: GermanCharacter; upper: GermanCharacter }> = {
  a: { lower: 'ä', upper: 'Ä' },
  o: { lower: 'ö', upper: 'Ö' },
  u: { lower: 'ü', upper: 'Ü' },
  s: { lower: 'ß', upper: 'ß' },
};

export type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Inserts `character` at the caret of `field`, replacing any selection, and leaves the
 * caret directly after it with focus still in the field.
 */
export function insertAtCursor(field: TextField, character: string): string {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const next = `${field.value.slice(0, start)}${character}${field.value.slice(end)}`;

  // Assign through the native setter so React's synthetic onChange still fires.
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(field, next);
  else field.value = next;

  field.dispatchEvent(new Event('input', { bubbles: true }));

  const caret = start + character.length;
  field.focus();
  field.setSelectionRange(caret, caret);
  return next;
}

/** Attach to a text field's `onKeyDown` to enable the Alt+letter shortcuts. */
export function handleGermanCharacterShortcut(event: React.KeyboardEvent<TextField>): boolean {
  if (!event.altKey || event.ctrlKey || event.metaKey) return false;
  const mapping = SHORTCUTS[event.key.toLowerCase()];
  if (!mapping) return false;

  event.preventDefault();
  insertAtCursor(event.currentTarget, event.shiftKey ? mapping.upper : mapping.lower);
  return true;
}
