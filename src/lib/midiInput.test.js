import { describe, expect, it, vi } from 'vitest';
import { MidiInputManager, preferredMidiInput } from './midiInput.js';

const port = (id, name) => ({ id, name, manufacturer: 'Akai', onmidimessage: null });

describe('MIDI input selection', () => {
  it('prefers the note-playing MIDI port over MPK DAW and plug-in ports', () => {
    const inputs = [
      port('daw', 'MPK mini IV DAW Port'),
      port('din', 'MPK mini IV Din Port'),
      port('plugin', 'MPK mini IV Plugin Port'),
      port('notes', 'MPK mini IV MIDI Port'),
    ];

    expect(preferredMidiInput(inputs)?.id).toBe('notes');
  });

  it('keeps an explicit selection while that port is still connected', () => {
    const manager = new MidiInputManager();
    const daw = port('daw', 'MPK mini IV DAW Port');
    const notes = port('notes', 'MPK mini IV MIDI Port');
    manager.access = { inputs: new Map([[daw.id, daw], [notes.id, notes]]) };
    manager.selectedId = 'daw';
    manager._boundMessage = vi.fn();

    manager._refreshInputs();

    expect(manager.selectedId).toBe('daw');
    expect(daw.onmidimessage).toBe(manager._boundMessage);
    expect(notes.onmidimessage).toBeNull();
  });

  it('falls back to the first input when names provide no useful signal', () => {
    const inputs = [port('first', 'USB Input A'), port('second', 'USB Input B')];
    expect(preferredMidiInput(inputs)?.id).toBe('first');
  });
});
