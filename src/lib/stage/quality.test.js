import { describe, expect, it } from 'vitest';
import { explainStageDetail, normalizeStageQuality, pickStageTier, STAGE_QUALITIES, STAGE_TIERS } from './quality.js';

const NVIDIA = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const INTEL = 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const capable = { cores: 8, deviceMemory: 8 };

describe('stage quality tier', () => {
  it('gives a real GPU the full stage', () => {
    for (const rendererName of [NVIDIA, INTEL, 'Apple GPU', 'Apple M1', 'Mali-G78', 'Adreno (TM) 740']) {
      expect(pickStageTier({ ...capable, rendererName })).toBe(STAGE_TIERS.FULL);
    }
  });

  it('gives software rendering the light stage', () => {
    for (const rendererName of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Google SwiftShader',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Mesa softpipe',
      'Software Rasterizer',
    ]) {
      expect(pickStageTier({ ...capable, rendererName })).toBe(STAGE_TIERS.LIGHT);
    }
  });

  it('gives a machine short on memory or cores the light stage', () => {
    expect(pickStageTier({ rendererName: NVIDIA, cores: 8, deviceMemory: 2 })).toBe(STAGE_TIERS.LIGHT);
    expect(pickStageTier({ rendererName: NVIDIA, cores: 2, deviceMemory: 8 })).toBe(STAGE_TIERS.LIGHT);
  });

  it('counts exactly four cores and four gigabytes as enough', () => {
    expect(pickStageTier({ rendererName: NVIDIA, cores: 4, deviceMemory: 4 })).toBe(STAGE_TIERS.FULL);
    expect(pickStageTier({ rendererName: NVIDIA, cores: 3, deviceMemory: 8 })).toBe(STAGE_TIERS.LIGHT);
    expect(pickStageTier({ rendererName: NVIDIA, cores: 8, deviceMemory: 3.9 })).toBe(STAGE_TIERS.LIGHT);
  });

  it('reads null like undefined: a count the browser did not report', () => {
    expect(pickStageTier({ rendererName: NVIDIA, cores: null, deviceMemory: null })).toBe(STAGE_TIERS.FULL);
    expect(pickStageTier({ rendererName: null, cores: 8 })).toBe(STAGE_TIERS.FULL);
    expect(pickStageTier({ rendererName: null, cores: null })).toBe(STAGE_TIERS.LIGHT);
  });

  it('does not penalise a browser that withholds memory or core counts', () => {
    expect(pickStageTier({ rendererName: NVIDIA })).toBe(STAGE_TIERS.FULL);
    expect(pickStageTier({ rendererName: INTEL, cores: undefined, deviceMemory: undefined })).toBe(STAGE_TIERS.FULL);
  });

  it('trusts a hidden GPU name only on a machine that is otherwise capable', () => {
    expect(pickStageTier({ rendererName: '', cores: 8, deviceMemory: 8 })).toBe(STAGE_TIERS.FULL);
    expect(pickStageTier({ rendererName: '', cores: 4 })).toBe(STAGE_TIERS.FULL);
    expect(pickStageTier({ rendererName: '' })).toBe(STAGE_TIERS.LIGHT);
    expect(pickStageTier({ rendererName: '', cores: 2 })).toBe(STAGE_TIERS.LIGHT);
    expect(pickStageTier()).toBe(STAGE_TIERS.LIGHT);
  });

  it('lets the player override the guess in either direction', () => {
    expect(pickStageTier({ override: 'full', rendererName: 'Google SwiftShader', cores: 1 })).toBe(STAGE_TIERS.FULL);
    expect(pickStageTier({ override: 'light', rendererName: NVIDIA, ...capable })).toBe(STAGE_TIERS.LIGHT);
  });

  it('treats an unknown override as automatic', () => {
    for (const override of ['auto', 'ultra', '', null, undefined, 3]) {
      expect(pickStageTier({ override, rendererName: NVIDIA, ...capable })).toBe(STAGE_TIERS.FULL);
      expect(pickStageTier({ override, rendererName: 'llvmpipe', ...capable })).toBe(STAGE_TIERS.LIGHT);
    }
  });

  it('lists the choices a settings control can offer', () => {
    expect(STAGE_QUALITIES).toEqual(['auto', 'full', 'light']);
  });

  it('reads a stored choice it does not recognise as automatic', () => {
    for (const value of STAGE_QUALITIES) expect(normalizeStageQuality(value)).toBe(value);
    for (const value of ['ultra', '', null, undefined, 2, {}]) expect(normalizeStageQuality(value)).toBe('auto');
  });
});

describe('saying which 3D detail is in use, and why', () => {
  const SOFTWARE = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

  it('says the 3D models are showing at full detail', () => {
    expect(explainStageDetail({ quality: 'full', tier: 'full', rendererName: INTEL })).toMatch(/3D models/);
    expect(explainStageDetail({ quality: 'auto', tier: 'full', rendererName: INTEL })).toMatch(/3D models/);
  });

  it('says what a chosen Light detail shows, and how to get the models back', () => {
    const note = explainStageDetail({ quality: 'light', tier: 'light', rendererName: INTEL });
    expect(note).toMatch(/built-in guitar/);
    expect(note).toMatch(/Full/);
  });

  it('says when Auto chose Light because the browser draws 3D in software', () => {
    const note = explainStageDetail({ quality: 'auto', tier: 'light', rendererName: SOFTWARE });
    expect(note).toMatch(/graphics acceleration/);
    expect(note).toMatch(/Full/);
  });

  it('says when Auto chose Light for a device short on cores or memory', () => {
    const note = explainStageDetail({ quality: 'auto', tier: 'light', rendererName: INTEL });
    expect(note).toMatch(/this device/);
    expect(note).not.toMatch(/graphics acceleration/);
  });
});
