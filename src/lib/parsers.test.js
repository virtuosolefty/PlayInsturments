/**
 * @vitest-environment jsdom
 *
 * Integration tests against the real files in public/songs — these prove the
 * MIDI and MusicXML readers agree with what the generator wrote, so a bad parse
 * can't quietly turn into "you played a wrong note".
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { scoreFromMidiBuffer, scoreFromMusicXml } from './score.js';
import { noteName } from './theory.js';

const SONGS = resolve(process.cwd(), 'public/songs');

/**
 * Copy into an ArrayBuffer created in *this* realm. Under jsdom a Node Buffer's
 * backing ArrayBuffer comes from a different realm and fails the type checks
 * inside the MIDI reader, which is exactly the "empty file" symptom.
 */
export const toArrayBuffer = (buf) => new Uint8Array(buf).buffer;

const loadMidi = (id) =>
  scoreFromMidiBuffer(toArrayBuffer(readFileSync(resolve(SONGS, `${id}.mid`))), { id, title: id });

let manifest;
beforeAll(() => {
  manifest = JSON.parse(readFileSync(resolve(SONGS, 'songs.json'), 'utf8'));
});

describe('bundled library', () => {
  it('has a manifest with every field the UI reads', () => {
    expect(manifest.length).toBeGreaterThanOrEqual(8);
    for (const entry of manifest) {
      expect(entry).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        composer: expect.any(String),
        url: expect.stringMatching(/^\/songs\//),
      });
      expect(entry.difficulty).toBeGreaterThanOrEqual(1);
      // Equal, not strictly less: the rhythm exercise is one repeated G on
      // purpose, so that nothing but the rhythm is being judged.
      expect(entry.range[0]).toBeLessThanOrEqual(entry.range[1]);
    }
  });

  it('keeps every Path exercise inside a 25-key keybed', () => {
    // The whole point of the curriculum is that a beginner on a mini
    // controller is never graded on an arrangement the fitting engine had to
    // compromise. C3–C5 is an MPK Mini at its factory octave.
    const path = manifest.filter((entry) => entry.id.startsWith('path-'));
    expect(path).toHaveLength(15);
    for (const entry of path) {
      expect(entry.range[0]).toBeGreaterThanOrEqual(48);
      expect(entry.range[1]).toBeLessThanOrEqual(72);
      expect(entry.key).toEqual(['C', 'major']);
    }
  });

  it('gives every Path exercise a run length that fits a daily set', () => {
    // Four items in fifteen to twenty-five minutes only works if each one is
    // well under a minute, leaving room for the repeats that do the teaching.
    for (const entry of manifest.filter((e) => e.id.startsWith('path-'))) {
      expect(entry.approxDuration).toBeGreaterThan(15);
      expect(entry.approxDuration).toBeLessThan(45);
    }
  });

  it('parses every MIDI file into a playable score', () => {
    for (const entry of manifest.filter((m) => m.url.endsWith('.mid'))) {
      const score = scoreFromMidiBuffer(toArrayBuffer(readFileSync(resolve(SONGS, entry.url.replace(/^\/songs\//, '')))), { id: entry.id, title: entry.title });
      expect(score.notes.length, entry.id).toBe(entry.noteCount);
      expect(score.duration, entry.id).toBeGreaterThan(1);
      // notes must be time-sorted; the matcher relies on it for early exit
      for (let i = 1; i < score.notes.length; i += 1) {
        expect(score.notes[i].time).toBeGreaterThanOrEqual(score.notes[i - 1].time);
      }
      // every note must sit on a real piano key
      for (const note of score.notes) {
        expect(note.midi).toBeGreaterThanOrEqual(21);
        expect(note.midi).toBeLessThanOrEqual(108);
        expect(note.duration).toBeGreaterThan(0);
      }
      expect(['left', 'right']).toContain(score.notes[0].hand);
    }
  });

  it('reads Twinkle back as C C G G A A G', () => {
    const score = loadMidi('twinkle');
    const melody = score.notes
      .filter((n) => n.hand === 'right')
      .slice(0, 7)
      .map((n) => noteName(n.midi));
    expect(melody).toEqual(['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4']);
  });

  it('reads Ode to Joy back as E E F G G F E D', () => {
    const score = loadMidi('ode-to-joy');
    const melody = score.notes
      .filter((n) => n.hand === 'right')
      .slice(0, 8)
      .map((n) => noteName(n.midi));
    expect(melody).toEqual(['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4']);
  });

  it('detects plausible keys', () => {
    expect(loadMidi('twinkle').key.name).toBe('C major');
    expect(loadMidi('ode-to-joy').key.name).toBe('C major');
    expect(loadMidi('bach-prelude-c').key.name).toBe('C major');
    // Für Elise's opening period is squarely A minor
    expect(loadMidi('fur-elise').key.mode).toBe('minor');
  });

  it('separates hands', () => {
    const score = loadMidi('bach-prelude-c');
    const right = score.notes.filter((n) => n.hand === 'right');
    const left = score.notes.filter((n) => n.hand === 'left');
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    // the Bach figure keeps the hands in separate registers
    expect(Math.min(...right.map((n) => n.midi))).toBeGreaterThanOrEqual(
      Math.min(...left.map((n) => n.midi)),
    );
  });

  it('respects the written tempo', () => {
    expect(Math.round(loadMidi('moonlight-i').bpm)).toBe(54);
    expect(Math.round(loadMidi('twinkle').bpm)).toBe(92);
  });
});

describe('MusicXML reader', () => {
  const load = () =>
    scoreFromMusicXml(readFileSync(resolve(SONGS, 'twinkle-musicxml.musicxml'), 'utf8'), {
      id: 'xml',
      title: 'fallback',
    });

  it('reads the work title and tempo from the file', () => {
    const score = load();
    expect(score.title).toBe('Twinkle, Twinkle, Little Star (MusicXML)');
    expect(score.bpm).toBe(92);
    expect(score.timeSignature).toEqual([4, 4]);
    expect(score.source).toBe('musicxml');
  });

  it('reads the melody through <backup> without losing the beat', () => {
    const score = load();
    const melody = score.notes.filter((n) => n.hand === 'right').map((n) => noteName(n.midi));
    expect(melody).toEqual(['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4']);
  });

  it('places both staves on the same timeline', () => {
    const score = load();
    const spb = 60 / 92;
    const rh = score.notes.filter((n) => n.hand === 'right');
    // Bar 2 starts at beat 4 -> the fifth melody note (A4)
    expect(rh[4].time).toBeCloseTo(4 * spb, 3);
    // Left hand chord in bar 2 starts at the same moment
    const lhBar2 = score.notes.filter((n) => n.hand === 'left' && Math.abs(n.time - 4 * spb) < 0.01);
    expect(lhBar2.map((n) => noteName(n.midi)).sort()).toEqual(['A2', 'C3', 'F2']);
  });

  it('merges a tie across the barline into one long note', () => {
    const score = load();
    const spb = 60 / 92;
    const tied = score.notes.find((n) => n.hand === 'right' && Math.abs(n.time - 14 * spb) < 0.01);
    expect(tied).toBeDefined();
    expect(noteName(tied.midi)).toBe('C4');
    // half (2 beats) + whole (4 beats) = 6 beats, not two separate notes
    expect(tied.duration).toBeCloseTo(6 * spb, 2);
    const allC4Late = score.notes.filter((n) => n.midi === 60 && n.time > 13 * spb);
    expect(allC4Late).toHaveLength(1);
  });

  it('rejects malformed XML with a clear message', () => {
    expect(() => scoreFromMusicXml('<not-xml', { id: 'bad', title: 'bad' })).toThrow(/could not be parsed/i);
  });
});
