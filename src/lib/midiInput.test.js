import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(notes.onmidimessage).not.toBe(manager._boundMessage);
  });

  describe('connect()', () => {
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('reports an error instead of waiting forever when the browser never answers', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('navigator', { requestMIDIAccess: () => new Promise(() => {}) });
      const manager = new MidiInputManager();

      const pending = manager.connect();
      await vi.advanceTimersByTimeAsync(10000);
      await pending;

      expect(manager.status).toBe('error');
      expect(manager.error).toMatch(/did not answer/i);
    });

    it('still adopts a late answer from the browser', async () => {
      vi.useFakeTimers();
      let answer;
      vi.stubGlobal('navigator', { requestMIDIAccess: () => new Promise((r) => { answer = r; }) });
      const manager = new MidiInputManager();

      const pending = manager.connect();
      await vi.advanceTimersByTimeAsync(10000);
      await pending;
      answer({ inputs: new Map([['a', port('a', 'USB Input A')]]), outputs: new Map() });
      await vi.advanceTimersByTimeAsync(0);

      expect(manager.status).toBe('ready');
      expect(manager.selectedId).toBe('a');
    });
  });

  describe('following the port you actually play', () => {
    const noteOn = (midi = 60, velocity = 100) => ({ data: [0x90, midi, velocity], timeStamp: 1 });

    function setup(selectedName = 'MPK mini IV DAW Port') {
      const manager = new MidiInputManager();
      const daw = port('daw', selectedName);
      const notes = port('notes', 'USB Input B');
      manager.access = { inputs: new Map([[daw.id, daw], [notes.id, notes]]) };
      manager.selectedId = 'daw';
      manager._refreshInputs();
      const heard = [];
      manager.onMessage((m) => heard.push(m));
      return { manager, daw, notes, heard };
    }

    it('switches to a silent-selected controller\'s other port when notes arrive there', () => {
      const { manager, notes, heard } = setup();

      notes.onmidimessage(noteOn(64));

      expect(manager.selectedId).toBe('notes');
      expect(notes.onmidimessage).toBe(manager._boundMessage);
      expect(heard).toEqual([expect.objectContaining({ type: 'noteon', midi: 64 })]);
    });

    it('tells the UI which port it moved to', () => {
      const { manager, notes } = setup();
      const seen = [];
      manager.onDevicesChanged((s) => seen.push(s.selectedId));

      notes.onmidimessage(noteOn());

      expect(seen).toContain('notes');
    });

    it('ignores knobs and other non-note traffic on other ports', () => {
      const { manager, notes, heard } = setup();

      notes.onmidimessage({ data: [0xb0, 1, 90], timeStamp: 1 });
      notes.onmidimessage({ data: [0x90, 60, 0], timeStamp: 1 });

      expect(manager.selectedId).toBe('daw');
      expect(heard).toEqual([]);
    });

    it('stays put once the selected port has produced notes', () => {
      const { manager, daw, notes, heard } = setup();

      daw.onmidimessage(noteOn(60));
      notes.onmidimessage(noteOn(60));

      expect(manager.selectedId).toBe('daw');
      expect(heard).toHaveLength(1);
    });

    it('never overrides a port the user chose explicitly', () => {
      const { manager, notes, heard } = setup();
      manager.select('daw');

      notes.onmidimessage(noteOn());

      expect(manager.selectedId).toBe('daw');
      expect(heard).toEqual([]);
    });

    it('starts following again after the chosen port disappears', () => {
      const { manager, daw, notes, heard } = setup();
      const other = port('other', 'USB Input C');
      manager.select('daw');
      manager.access.inputs = new Map([[notes.id, notes], [other.id, other]]);

      manager._refreshInputs();
      other.onmidimessage(noteOn(67));

      expect(manager.selectedId).toBe('other');
      expect(heard).toHaveLength(1);
      expect(daw.onmidimessage).toBeNull();
    });
  });

  it('falls back to the first input when names provide no useful signal', () => {
    const inputs = [port('first', 'USB Input A'), port('second', 'USB Input B')];
    expect(preferredMidiInput(inputs)?.id).toBe('first');
  });
});
