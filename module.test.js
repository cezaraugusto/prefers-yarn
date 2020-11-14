/* global describe, test, expect */
const fs = require('fs-extra')
const prefersYarn = require('./module')

describe('prefersYarn', () => {
  beforeAll(async () => {
    await fs.ensureFile('./yarn.lock')
  })
  test('returns true when a yarn.lock file is found', async () => {
    expect(prefersYarn()).toBe(true)
  })
  test('returns false when a yarn.lock file is not found', async () => {
    await fs.unlink('./yarn.lock')
    expect(prefersYarn()).toBe(false)
  })
})
