import {describe, expect, test} from '@jest/globals'
import { _computeNewVersion } from "../src/commands/release";

/**
 * 0.0.1        patch
 * 0.0.2        patch
 * 0.0.3        minor
 * 0.1.0        patch
 * 0.1.2        major-pr
 * 1.0.0-x.1    pre-release
 * 1.0.0-x.2    promote
 * 1.0.0        minor-pr
 * 1.1.0-x.1
 */

/**
 * major
 * minor
 * patch
 * major-pr
 * minor-pr
 * patch-pr
 * pr from major-pr
 * promote from major-pr
 */

describe('stable from stable', () => {
  
  test('major', () => {
    const current = '1.2.3';
    const expected = '2.0.0';
    
    const result = _computeNewVersion(current, 'major', 'rc', false);
    expect(result).toBe(expected);
  });
  
  test('minor', () => {
    const current = '1.2.3';
    const expected = '1.3.0';
    
    const result = _computeNewVersion(current, 'minor', 'rc', false);
    expect(result).toBe(expected);
  });
  
  test('patch', () => {
    const current = '1.2.3';
    const expected = '1.2.4';
    
    const result = _computeNewVersion(current, 'patch', 'rc', false);
    expect(result).toBe(expected);
  });
})

describe('pre-release from stable', () => {
  
  test('major', () => {
    const preReleasePrefix = 'alpha'
    const current = '1.2.3';
    const expected = `2.0.0-${preReleasePrefix}.1`;
    
    const result = _computeNewVersion(current, 'major', preReleasePrefix, true);
    expect(result).toBe(expected);
  });
  
  test('minor', () => {
    const preReleasePrefix = 'alpha'
    const current = '1.2.3';
    const expected = `1.3.0-${preReleasePrefix}.1`;
    
    const result = _computeNewVersion(current, 'minor', preReleasePrefix, true);
    expect(result).toBe(expected);
  });
  
  test('patch', () => {
    const preReleasePrefix = 'alpha'
    const current = '1.2.3';
    const expected = `1.2.4-${preReleasePrefix}.1`;
    
    const result = _computeNewVersion(current, 'patch', preReleasePrefix, true);
    expect(result).toBe(expected);
  });
})

describe('update pre-release', () => {
  
  test('pre-release', () => {
    const preReleasePrefix = 'alpha'
    const current = `1.2.3-${preReleasePrefix}.2`;
    const expected = `1.2.3-${preReleasePrefix}.3`;
    
    const result = _computeNewVersion(current, 'pre-release', preReleasePrefix, true);
    expect(result).toBe(expected);
  });
  
})

describe('promote pre-release', () => {
  
  test('promote', () => {
    const preReleasePrefix = 'alpha'
    const current = `1.2.3-${preReleasePrefix}.2`;
    const expected = `1.2.3`;
    
    const result = _computeNewVersion(current, 'promote', preReleasePrefix, false);
    expect(result).toBe(expected);
  });
  
})

