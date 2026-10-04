/**
 * @vitest-environment jsdom
 *
 * The card that tells a beginner which note to find next in a lesson. On the
 * piano it also names the computer key that plays it, at whatever keyboard
 * octave the player has chosen, and it shows how much of the phrase is found.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import NextNoteCard, { ComputerKey } from './NextNoteCard.jsx';

let container;
let root;

const render = ui => act(() => root.render(ui));
const key = () => container.querySelector('.lesson-key kbd')?.textContent ?? null;
const D4 = { name: 'D4', midi: 62, finger: 2 };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the next note to find', () => {
  it('says what the note is and which computer key plays it on the piano', () => {
    render(<NextNoteCard note={D4} instrument="piano" found={0} total={8} typingOctave={0} />);
    expect(container.querySelector('strong').textContent).toBe('D4 · finger 2');
    expect(key()).toBe('S');
  });

  it('follows the keyboard octave the player has chosen', () => {
    const D5 = { name: 'D5', midi: 74 };
    render(<NextNoteCard note={D5} instrument="piano" found={0} total={8} typingOctave={0} />);
    expect(key()).toBe('L');
    render(<NextNoteCard note={D5} instrument="piano" found={0} total={8} typingOctave={1} />);
    expect(key()).toBe('S');
  });

  it('names no key for a note the computer keys do not reach, or on another instrument', () => {
    render(<NextNoteCard note={{ name: 'F#1', midi: 30 }} instrument="piano" found={0} total={8} typingOctave={0} />);
    expect(container.querySelector('.lesson-key')).toBeNull();
    render(<NextNoteCard note={{ name: 'D4', midi: 62, string: 3, fret: 0 }} instrument="violin" found={0} total={8} typingOctave={0} />);
    expect(container.querySelector('.lesson-key')).toBeNull();
  });

  it('fills the bar by the share of the phrase found, and says it in words too', () => {
    render(<NextNoteCard note={D4} instrument="piano" found={3} total={12} typingOctave={0} />);
    expect(container.querySelector('.lesson-progress i').style.width).toBe('25%');
    expect(container.querySelector('p').textContent).toBe('3 / 12 notes found');
    render(<NextNoteCard note={D4} instrument="piano" found={0} total={0} typingOctave={0} />);
    expect(container.querySelector('.lesson-progress i').style.width).toBe('0%');
  });

  it('waits for its note while the lesson is still preparing', () => {
    render(<NextNoteCard note={undefined} instrument="piano" found={0} total={0} typingOctave={0} />);
    expect(container.querySelector('strong').textContent).toBe('Preparing your first note…');
    expect(container.querySelector('.lesson-key')).toBeNull();
  });
});

describe('the computer key for a note', () => {
  it('stands alone for the first-note card', () => {
    render(<ComputerKey midi={60} instrument="piano" typingOctave={0} />);
    expect(key()).toBe('A');
    render(<ComputerKey midi={60} instrument="guitar" typingOctave={0} />);
    expect(container.innerHTML).toBe('');
  });
});
