import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSeatOptionsForTable,
  isValidSelfServiceSeat,
  normalizeTableCode,
  isValidSelfServiceTable,
  normalizeSeatCode,
} from '../lib/timer/selfServiceCore.ts'

test('normalizeTableCode accepts table codes case-insensitively', () => {
  assert.equal(normalizeTableCode(' f1 '), 'F1')
  assert.equal(normalizeTableCode('s3'), 'S3')
  assert.equal(normalizeTableCode('D4'), 'D4')
})

test('isValidSelfServiceTable follows the self-service table set', () => {
  for (const code of ['S1', 'S2', 'S3', 'D1', 'D2', 'D3', 'D4', 'F1', 'F2']) {
    assert.equal(isValidSelfServiceTable(code), true, `${code} should be accepted`)
  }
  assert.equal(isValidSelfServiceTable('S4'), false)
  assert.equal(isValidSelfServiceTable('A1'), false)
})

test('getSeatOptionsForTable maps table capacity to seat codes with dash separator', () => {
  assert.deepEqual(getSeatOptionsForTable('S1'), ['S1-A'])
  assert.deepEqual(getSeatOptionsForTable('D1'), ['D1-A', 'D1-B'])
  assert.deepEqual(getSeatOptionsForTable('F2'), ['F2-A', 'F2-B', 'F2-C', 'F2-D'])
})

test('normalizeSeatCode validates seat code against selected table', () => {
  assert.equal(normalizeSeatCode('f1', ' f1-c '), 'F1-C')
  assert.equal(isValidSelfServiceSeat('D2', 'D2-B'), true)
  assert.equal(isValidSelfServiceSeat('D2', 'D2-C'), false)
  assert.equal(isValidSelfServiceSeat('S1', 'S1-A'), true)
  assert.equal(isValidSelfServiceSeat('S1', 'S1-B'), false)
  assert.equal(isValidSelfServiceSeat('F1', 'F2-A'), false)
})
