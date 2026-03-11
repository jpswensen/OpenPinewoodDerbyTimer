import { describe, it, expect, beforeEach } from 'vitest'
import {
  readString,
  readBool,
  readNumber,
  writeValue,
  clampNumber,
  STORAGE_KEYS,
} from '../../lib/settings'

describe('settings utilities', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('readString', () => {
    it('returns default when key is missing', () => {
      expect(readString('nonexistent', 'default')).toBe('default')
    })

    it('returns stored value', () => {
      localStorage.setItem('key', 'stored')
      expect(readString('key', 'default')).toBe('stored')
    })
  })

  describe('readBool', () => {
    it('returns default when key is missing', () => {
      expect(readBool('missing', true)).toBe(true)
      expect(readBool('missing', false)).toBe(false)
    })

    it('parses true/false strings', () => {
      localStorage.setItem('b', 'true')
      expect(readBool('b', false)).toBe(true)
      localStorage.setItem('b', 'false')
      expect(readBool('b', true)).toBe(false)
    })

    it('returns default for invalid value', () => {
      localStorage.setItem('b', 'invalid')
      expect(readBool('b', true)).toBe(true)
    })
  })

  describe('readNumber', () => {
    it('returns default when key is missing', () => {
      expect(readNumber('missing', 42)).toBe(42)
    })

    it('parses stored number', () => {
      localStorage.setItem('n', '7.5')
      expect(readNumber('n', 0)).toBe(7.5)
    })

    it('clamps to min/max', () => {
      localStorage.setItem('n', '200')
      expect(readNumber('n', 0, { min: 0, max: 100 })).toBe(100)
    })

    it('truncates to integer when requested', () => {
      localStorage.setItem('n', '3.7')
      expect(readNumber('n', 0, { integer: true })).toBe(3)
    })

    it('returns default for non-finite', () => {
      localStorage.setItem('n', 'NaN')
      expect(readNumber('n', 5)).toBe(5)
    })
  })

  describe('clampNumber', () => {
    it('clamps below min', () => {
      expect(clampNumber(-5, 0, 100)).toBe(0)
    })

    it('clamps above max', () => {
      expect(clampNumber(200, 0, 100)).toBe(100)
    })

    it('returns min for NaN', () => {
      expect(clampNumber(NaN, 0, 100)).toBe(0)
    })
  })

  describe('writeValue', () => {
    it('writes string value', () => {
      writeValue('key', 'val')
      expect(localStorage.getItem('key')).toBe('val')
    })

    it('writes number value', () => {
      writeValue('key', 42)
      expect(localStorage.getItem('key')).toBe('42')
    })

    it('removes key when value is null', () => {
      localStorage.setItem('key', 'existing')
      writeValue('key', null)
      expect(localStorage.getItem('key')).toBeNull()
    })

    it('removes key when value is undefined', () => {
      localStorage.setItem('key', 'existing')
      writeValue('key', undefined)
      expect(localStorage.getItem('key')).toBeNull()
    })
  })

  describe('STORAGE_KEYS', () => {
    it('has expected keys', () => {
      expect(STORAGE_KEYS.connectionMode).toBe('pwdtimer-connection-mode')
      expect(STORAGE_KEYS.laneCount).toBe('pwdtimer-lane-count')
      expect(STORAGE_KEYS.soundEnabled).toBe('pwdtimer-sound-enabled')
    })
  })
})
