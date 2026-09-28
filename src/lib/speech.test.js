/**
 * What the coach is allowed to say out loud. Spoken feedback is harder to
 * ignore than written feedback, so it has to be both true and short.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelSpeech, coachingScript, speak, speechAvailable } from './speech.js';
import { gradeRun } from './grading.js';

const grade = (over) => ({
  complete: true,
  coverage: 1,
  stars: 4,
  overall: 87,
  headline: 'Strong run',
  weakest: 'timing',
  bands: { notes: 96, timing: 71, dynamics: 88 },
  ...over,
});

const summary = (over) => ({ hit: 20, missed: 0, wrongNotes: 0, meanSignedDeviationMs: 0, ...over });

describe('coachingScript', () => {
  it('leads with the verdict, then one fault, then one instruction', () => {
    const lines = coachingScript({
      grade: grade(),
      summary: summary({ meanSignedDeviationMs: -140 }),
      step: { label: 'Run it again' },
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Strong run. four stars, 87 out of 100.');
    expect(lines[1]).toMatch(/rushing by about 140 milliseconds/);
    expect(lines[2]).toBe('Run it again.');
  });

  it('says which way you are off the beat, not what percent you scored', () => {
    const dragging = coachingScript({ grade: grade(), summary: summary({ meanSignedDeviationMs: 210 }) });
    expect(dragging[1]).toMatch(/dragging/);
    expect(dragging.join(' ')).not.toMatch(/71/);
  });

  it('does not call an even 5ms drift rushing', () => {
    const lines = coachingScript({ grade: grade(), summary: summary({ meanSignedDeviationMs: 5 }) });
    expect(lines[1]).not.toMatch(/rushing|dragging/);
  });

  it('counts the notes when the pitches are what went wrong', () => {
    const lines = coachingScript({
      grade: grade({ weakest: 'notes', stars: 2 }),
      summary: summary({ missed: 3, wrongNotes: 1 }),
    });
    expect(lines[1]).toBe('three notes missed and one extra note. Slow it down until every pitch is right.');
  });

  it('invents no criticism for a perfect run', () => {
    const lines = coachingScript({
      grade: grade({ stars: 5, overall: 97, headline: 'Mastered', weakest: 'dynamics' }),
      summary: summary(),
      step: { label: 'Next piece: Gymnopédie' },
    });
    expect(lines).toEqual(['Mastered. five stars, 97 out of 100.', 'Next piece: Gymnopédie.']);
  });

  it('never claims a rating for a run that did not earn one', () => {
    const incomplete = gradeRun({ hit: 4, total: 40, missed: 36, wrongNotes: 0, score: 0.1 }, { coverage: 0.2 });
    const lines = coachingScript({ grade: incomplete, summary: summary({ hit: 4 }), step: { label: 'Play it all the way through' } });
    expect(lines.join(' ')).not.toMatch(/star/);
    expect(lines[0]).toMatch(/20 percent/);
  });

  it('says the honest thing when nothing at all was played', () => {
    const s = { hit: 0, total: 40, missed: 40, wrongNotes: 0, score: 0 };
    const lines = coachingScript({ grade: gradeRun(s, { coverage: 0 }), summary: s });
    expect(lines[0]).toMatch(/nothing to score/);
  });

  it('does not tell someone who played six wrong notes that they played nothing', () => {
    const s = { hit: 0, total: 40, missed: 40, wrongNotes: 6, score: 0 };
    const lines = coachingScript({ grade: gradeRun(s, { coverage: 0.1 }), summary: s });
    expect(lines[0]).not.toMatch(/[Nn]othing was played/);
    expect(lines[0]).toMatch(/none of the notes you played/i);
  });

  it('has nothing to say without a grade', () => {
    expect(coachingScript({})).toEqual([]);
    expect(coachingScript()).toEqual([]);
  });
});

describe('speaking', () => {
  // These tests run in node, where there is no `window` at all — which is also
  // the shape the guard clauses have to survive, so it is worth testing both.
  afterEach(() => {
    delete globalThis.window;
  });

  const install = () => {
    const calls = { cancel: 0, spoken: [] };
    globalThis.window = {
      speechSynthesis: {
        cancel: () => (calls.cancel += 1),
        speak: (u) => calls.spoken.push(u.text),
      },
      SpeechSynthesisUtterance: class {
        constructor(text) {
          this.text = text;
        }
      },
    };
    return calls;
  };

  it('joins the script into one utterance and drops whatever was mid-sentence', () => {
    const calls = install();
    expect(speak(['One.', 'Two.'])).toBe(true);
    expect(calls.spoken).toEqual(['One. Two.']);
    expect(calls.cancel).toBe(1);
  });

  it('stays silent rather than throwing where the API does not exist', () => {
    expect(speechAvailable()).toBe(false);
    expect(speak(['anything'])).toBe(false);
    expect(() => cancelSpeech()).not.toThrow();
  });

  it('says nothing for an empty script', () => {
    const calls = install();
    expect(speak([])).toBe(false);
    expect(speak([null, ''])).toBe(false);
    expect(calls.spoken).toEqual([]);
  });

  it('survives a synthesiser that throws', () => {
    install();
    globalThis.window.speechSynthesis.speak = () => {
      throw new Error('synthesis failed');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(speak(['hello'])).toBe(false);
    warn.mockRestore();
  });
});
