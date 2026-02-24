import { describe, it, expect } from 'vitest';
import { detect } from '../../src/address/detect';

describe('detect()', () => {
  it('should return "G" for valid G addresses (Ed25519 Public Key)', () => {
    const validG = 'GBAH07YQSTHBBHLW2YV7W7L5T5K1SDRRCH0LHLHXLHLHLHLHLHLHLHXL';
    expect(detect(validG)).toBe('G');
  });

  it('should return "M" for valid M addresses (Muxed Account)', () => {
    const validM = 'MA7QYNF7SOWQ3GLR2B7YNP35M6BCHDJ6IPJCZCHVXL6V677R7D43GAAAAAAAAAAABGNC4';
    expect(detect(validM)).toBe('M');
  });

  it('should return "C" for valid C addresses (Contract ID)', () => {
    const validC = 'CA7QYNF7SOWQ3GLR2B7YNP35M6BCHDJ6IPJCZCHVXL6V677R7D43GAMA';
    expect(detect(validC)).toBe('C');
  });

  it('should return null for unrecognized strings or empty input', () => {
    expect(detect('')).toBe(null);
    expect(detect('random_string')).toBe(null);
    expect(detect('G12345')).toBe(null);
  });

  it('should return null for addresses with invalid checksums', () => {
    // Modified the last character of a valid G address to force checksum failure
    const invalidChecksumG = 'GBAH07YQSTHBBHLW2YV7W7L5T5K1SDRRCH0LHLHXLHLHLHLHLHLHLHXA';
    expect(detect(invalidChecksumG)).toBe(null);
  });
});