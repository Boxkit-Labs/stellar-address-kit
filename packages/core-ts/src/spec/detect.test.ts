import { describe, it, expect } from 'vitest';
import { detect } from '../address/detect';
import { SAMPLE_C, SAMPLE_G, SAMPLE_M } from '@/spec/validate.test';

describe('detect()', () => {
  it('should return "G" for valid G addresses (Ed25519 Public Key)', () => {
    expect(detect(SAMPLE_G)).toBe('G');
  });

  it('should return "M" for valid M addresses (Muxed Account)', () => {
    expect(detect(SAMPLE_M)).toBe('M');
  });

  it('should return "C" for valid C addresses (Contract ID)', () => {
    expect(detect(SAMPLE_C)).toBe('C');
  });

  it('should return invalid for addresses with invalid checksums', () => {
    const invalidChecksumG = '7YQSTHBBHLW2YV7W7L5T5K1SDRRCH0LHLHXLHLHLHLHLHLHLHXA';
    expect(detect(invalidChecksumG)).toBe("invalid");
  });
});