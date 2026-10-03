import { describe, expect, it } from 'vitest';
import { quantizeFrame, quantizePart } from './quantize.mjs';

const part = {
  positions: new Float32Array([-12, 0, -1, 8, 0.2, 1, -2, -0.5, 0.25]),
  normals: new Float32Array([0, 1, 0, 0.6, 0.8, 0, 0, 0, -1]),
  uvs: new Float32Array([0, 0, 1, 1, 0.5, 0.25]),
  tangents: new Float32Array([1, 0, 0, 1, 0, 0, 1, -1, 0, 1, 0, 1]),
};

describe('quantizing a part for KHR_mesh_quantization', () => {
  it('frames the part about its middle with one scale, so normals need no correcting', () => {
    const frame = quantizeFrame([part.positions]);
    [-2, -0.15, 0].forEach((v, k) => expect(frame.translation[k]).toBeCloseTo(v, 6));
    expect(frame.scale).toBeCloseTo(10, 10);
  });

  it('stores positions as 16-bit fractions of the frame that come back within a hair of where they were', () => {
    const frame = quantizeFrame([part.positions]), q = quantizePart(part, frame);
    expect(q.positions).toBeInstanceOf(Int16Array);
    for (let i = 0; i < part.positions.length; i++) {
      const back = frame.translation[i % 3] + frame.scale * Math.max(-1, q.positions[i] / 32767);
      expect(Math.abs(back - part.positions[i])).toBeLessThan(frame.scale / 32767);
    }
  });

  it('stores normals and tangents as 8-bit fractions, keeping the tangents\' handedness', () => {
    const q = quantizePart(part, quantizeFrame([part.positions]));
    expect(q.normals).toBeInstanceOf(Int8Array);
    expect([...q.normals.slice(3, 6)]).toEqual([76, 102, 0]);
    expect(q.tangents).toBeInstanceOf(Int8Array);
    expect([...q.tangents.slice(4, 8)]).toEqual([0, 0, 127, -127]);
  });

  it('stores texture coordinates as 16-bit fractions when they stay within 0 to 1, and as they were otherwise', () => {
    const q = quantizePart(part, quantizeFrame([part.positions]));
    expect(q.uvs).toBeInstanceOf(Uint16Array);
    expect(q.uvsNormalized).toBe(true);
    expect([...q.uvs.slice(2, 4)]).toEqual([65535, 65535]);
    const tiled = quantizePart({ ...part, uvs: new Float32Array([0, 0, 2, 1, 0.5, 0.5]) }, quantizeFrame([part.positions]));
    expect(tiled.uvs).toBeInstanceOf(Float32Array);
    expect(tiled.uvsNormalized).toBe(false);
  });

  it('shares one frame between the pieces of a part, since they hang from one node', () => {
    const other = new Float32Array([20, 0, 0, 22, 1, 0]);
    const frame = quantizeFrame([part.positions, other]);
    expect(frame.translation[0]).toBeCloseTo(5, 10);
    expect(frame.scale).toBeCloseTo(17, 10);
  });

  it('copes with a part that has no size along any axis', () => {
    const frame = quantizeFrame([new Float32Array([1, 2, 3, 1, 2, 3])]);
    expect(frame.scale).toBe(1);
    expect([...quantizePart({ positions: new Float32Array([1, 2, 3]) }, frame).positions]).toEqual([0, 0, 0]);
  });
});
