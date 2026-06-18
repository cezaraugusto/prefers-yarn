import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import prefersYarnDefault, {
  buildInstallCommand,
  buildNpmCliFallback,
  detectPackageManager,
  detectPackageManagerFromEnv,
  detectPackageManagerFromLockfile,
  detectPackageManagerFromPackageJson,
  getPackageManagerSpec,
  getPackageManagerVersion,
  prefersYarn,
  resolvePackageManager
} from '../src/index'

const ENV_VARS = [
  'npm_config_user_agent',
  'npm_execpath',
  'NPM_EXEC_PATH',
  'BUN_INSTALL',
  'PREFERRED_PACKAGE_MANAGER',
  'PREFERRED_PM_EXEC_PATH'
]

let tmpDir: string

beforeEach(() => {
  // Tests themselves run under a package manager (pnpm), so neutralize
  // every env signal before each test.
  for (const name of ENV_VARS) {
    vi.stubEnv(name, '')
  }

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prefers-yarn-'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(tmpDir, {recursive: true, force: true})
})

describe('detectPackageManagerFromEnv (user agent)', () => {
  it.each([
    ['pnpm', 'pnpm/9.9.0 npm/? node/v20.0.0 darwin x64'],
    ['yarn', 'yarn/1.22.22 npm/? node/v20.0.0 darwin x64'],
    ['bun', 'bun/1.1.0 npm/? node/v20.0.0 darwin x64'],
    ['npm', 'npm/10.8.2 node/v20.0.0 darwin x64']
  ] as const)('detects %s from npm_config_user_agent', (name, userAgent) => {
    vi.stubEnv('npm_config_user_agent', userAgent)
    expect(detectPackageManagerFromEnv()).toBe(name)
  })

  it.each([
    ['pnpm', '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs'],
    ['yarn', '/usr/local/lib/node_modules/yarn/bin/yarn.js'],
    ['bun', '/Users/me/.bun/bin/bun'],
    ['npm', '/usr/local/lib/node_modules/npm/bin/npm-cli.js']
  ] as const)('falls back to npm_execpath for %s', (name, execPath) => {
    vi.stubEnv('npm_execpath', execPath)
    expect(detectPackageManagerFromEnv()).toBe(name)
  })

  it('detects bun from BUN_INSTALL', () => {
    vi.stubEnv('BUN_INSTALL', '/Users/me/.bun')
    expect(detectPackageManagerFromEnv()).toBe('bun')
  })

  it('defaults to npm when no signal is present', () => {
    expect(detectPackageManagerFromEnv()).toBe('npm')
  })
})

describe('getPackageManagerSpec / getPackageManagerVersion', () => {
  it('parses name@version from the user agent', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/9.9.0 npm/? node/v20.0.0')
    expect(getPackageManagerSpec()).toBe('pnpm@9.9.0')
    expect(getPackageManagerVersion()).toEqual({
      name: 'pnpm',
      version: '9.9.0'
    })
  })

  it('returns null when the user agent is missing or unparseable', () => {
    expect(getPackageManagerSpec()).toBeNull()
    expect(getPackageManagerVersion()).toBeNull()

    vi.stubEnv('npm_config_user_agent', 'something-else entirely')
    expect(getPackageManagerSpec()).toBeNull()
  })
})

describe('detectPackageManagerFromLockfile', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm']
  ] as const)('detects %s as %s', (lockfile, name) => {
    fs.writeFileSync(path.join(tmpDir, lockfile), '')
    expect(detectPackageManagerFromLockfile(tmpDir)).toBe(name)
  })

  it('prefers pnpm-lock.yaml over other lockfiles', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '')
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    expect(detectPackageManagerFromLockfile(tmpDir)).toBe('pnpm')
  })

  it('returns undefined when no lockfile or cwd is given', () => {
    expect(detectPackageManagerFromLockfile(tmpDir)).toBeUndefined()
    expect(detectPackageManagerFromLockfile()).toBeUndefined()
  })
})

describe('detectPackageManagerFromPackageJson', () => {
  it('reads the corepack packageManager field', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({packageManager: 'yarn@4.1.0'})
    )
    expect(detectPackageManagerFromPackageJson(tmpDir)).toBe('yarn')
  })

  it('ignores missing or malformed package.json', () => {
    expect(detectPackageManagerFromPackageJson(tmpDir)).toBeUndefined()

    fs.writeFileSync(path.join(tmpDir, 'package.json'), 'not json')
    expect(detectPackageManagerFromPackageJson(tmpDir)).toBeUndefined()
  })
})

describe('detectPackageManager / resolvePackageManager', () => {
  it('lockfile wins over user agent', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.8.2 node/v20.0.0')
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
    expect(detectPackageManager({cwd: tmpDir})).toBe('yarn')
  })

  it('packageManager field wins when there is no lockfile', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.8.2 node/v20.0.0')
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({packageManager: 'bun@1.1.0'})
    )
    expect(detectPackageManager({cwd: tmpDir})).toBe('bun')
  })

  it('PREFERRED_PACKAGE_MANAGER override is honored', () => {
    vi.stubEnv('PREFERRED_PACKAGE_MANAGER', 'bun')
    expect(resolvePackageManager({cwd: tmpDir}).name).toBe('bun')
  })

  it('falls back to the invoking user agent', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/9.9.0 npm/? node/v20.0.0')
    const resolution = resolvePackageManager({cwd: tmpDir})

    expect(resolution.name).toBe('pnpm')
  })

  it('always returns a usable package manager name', () => {
    const name = detectPackageManager({cwd: tmpDir})

    expect(['npm', 'yarn', 'pnpm', 'bun']).toContain(name)
  })
})

describe('buildInstallCommand', () => {
  it('uses the runner command when present', () => {
    expect(
      buildInstallCommand(
        {
          name: 'pnpm',
          runnerCommand: 'corepack',
          runnerArgs: ['pnpm']
        },
        ['install']
      )
    ).toEqual({command: 'corepack', args: ['pnpm', 'install']})
  })

  it('keeps JS entrypoints under node', () => {
    const execPath = '/usr/local/lib/node_modules/npm/bin/npm-cli.js'

    expect(buildInstallCommand({name: 'npm', execPath}, ['install'])).toEqual(
      {
        command: process.execPath,
        args: [execPath, 'install']
      }
    )
  })

  it('executes native binaries directly', () => {
    expect(
      buildInstallCommand({name: 'pnpm', execPath: '/usr/local/bin/pnpm'}, [
        'add',
        'left-pad'
      ])
    ).toEqual({command: '/usr/local/bin/pnpm', args: ['add', 'left-pad']})
  })

  it('falls back to the bare package manager name', () => {
    expect(buildInstallCommand({name: 'yarn'}, ['install'])).toEqual({
      command: 'yarn',
      args: ['install']
    })
  })
})

describe('buildNpmCliFallback', () => {
  it('returns a node invocation of npm-cli.js or undefined', () => {
    const fallback = buildNpmCliFallback(['install'])

    if (fallback) {
      expect(fallback.command).toBe(process.execPath)
      expect(fallback.args[0]).toMatch(/npm-cli\.js$/)
      expect(fallback.args).toContain('install')
    } else {
      expect(fallback).toBeUndefined()
    }
  })
})

describe('prefersYarn (v1 back-compat)', () => {
  it('returns true when a yarn.lock file is found', () => {
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
    expect(prefersYarn(tmpDir)).toBe(true)
  })

  it('returns false when a yarn.lock file is not found', () => {
    expect(prefersYarn(tmpDir)).toBe(false)
  })

  it('defaults to process.cwd() like v1', () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      expect(prefersYarn()).toBe(false)
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
      expect(prefersYarn()).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('is also the default export', () => {
    expect(prefersYarnDefault).toBe(prefersYarn)
  })
})
