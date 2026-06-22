[npm-version-image]: https://img.shields.io/npm/v/prefers-yarn.svg?color=0971fe
[npm-version-url]: https://www.npmjs.com/package/prefers-yarn
[npm-downloads-image]: https://img.shields.io/npm/dm/prefers-yarn.svg?color=2ecc40
[npm-downloads-url]: https://www.npmjs.com/package/prefers-yarn
[action-image]: https://github.com/cezaraugusto/prefers-yarn/actions/workflows/ci.yml/badge.svg?branch=main
[action-url]: https://github.com/cezaraugusto/prefers-yarn/actions

> Detect the package manager (npm, yarn, pnpm, bun) a project prefers, then resolve a runnable command for it.

# prefers-yarn [![Version][npm-version-image]][npm-version-url] [![Downloads][npm-downloads-image]][npm-downloads-url] [![workflow][action-image]][action-url]

Most detection libraries stop at "is there a yarn.lock?". `prefers-yarn` v2 goes further. It combines several signals to pick the right package manager:

* the invoking process (`npm_config_user_agent` / `npm_execpath`)
* modern lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`/`bun.lock`, `package-lock.json`)
* the corepack `packageManager` field
* a Windows-safe PATH probe (`where.exe`, `.cmd` shims)

When the preferred manager is not directly runnable, it routes through corepack or falls back to the npm CLI bundled with the current Node.js install, so CLI authors always get a runnable package manager. Zero dependencies.

## Installation

```
npm install prefers-yarn
```

## Usage

```js
import { detectPackageManager } from 'prefers-yarn'

detectPackageManager()
// => 'npm' | 'yarn' | 'pnpm' | 'bun'

detectPackageManager({ cwd: '/path/to/project' })
// => respects that project's lockfile / packageManager field
```

Building and running an install command:

```js
import {
  resolvePackageManager,
  buildInstallCommand,
  runCommand
} from 'prefers-yarn'

const pm = resolvePackageManager({ cwd: projectDir })
// => { name: 'pnpm', execPath: '/usr/local/bin/pnpm' }

const { command, args } = buildInstallCommand(pm, ['install', '--silent'])
await runCommand(command, args, { cwd: projectDir, stdio: 'inherit' })
```

## API

### `detectPackageManager(opts?)`

Returns `'npm' | 'yarn' | 'pnpm' | 'bun'`. Resolution order:

1. Lockfile in `opts.cwd` (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`/`bun.lock`, `package-lock.json`)
2. `packageManager` field in the package.json at `opts.cwd` (corepack)
3. `PREFERRED_PACKAGE_MANAGER` / `PREFERRED_PM_EXEC_PATH` env overrides
4. Invoking process env (`npm_config_user_agent`, `npm_execpath`)
5. pnpm, yarn, or bun found on PATH
6. corepack
7. The npm CLI bundled with the current Node.js install
8. `'npm'` as a last resort

### `resolvePackageManager(opts?)`

Same resolution order, but returns the full
`{ name, execPath?, runnerCommand?, runnerArgs? }` shape so you can actually
spawn the package manager (e.g. `node /path/to/npm-cli.js` or
`corepack pnpm`).

### `detectPackageManagerFromEnv()`

Environment-only detection (user agent, then `npm_execpath` /
`NPM_EXEC_PATH` / `BUN_INSTALL`). Defaults to `'npm'`. Useful for "which
package manager launched my CLI?".

### `getPackageManagerSpec()` / `getPackageManagerVersion()`

Parse the invoking package manager's version from
`npm_config_user_agent`: `'pnpm@9.9.0'` or
`{ name: 'pnpm', version: '9.9.0' }`, or `null` when unavailable.

### `detectPackageManagerFromLockfile(cwd)` / `detectPackageManagerFromPackageJson(cwd)`

The individual project-level heuristics, exported for composing your own
ordering. Both return a name or `undefined`.

### `buildInstallCommand(pm, args)`

Turns a `PackageManagerResolution` into a spawnable `{ command, args }`,
keeping JS entrypoints under `node` and executing native/Windows binaries
directly.

### `buildNpmCliFallback(args)`

`{ command, args }` for the npm CLI bundled with the running Node.js
(`node /path/to/npm-cli.js ...args`), or `undefined` if it can't be found.

### `runCommand(command, args, options?)`

Promise-based `spawn` wrapper that handles Windows `.cmd`/`.bat` shells and
ensures the Node.js directory is on PATH. Options: `cwd`,
`stdio` (`'inherit' | 'ignore' | 'pipe'`, default `'ignore'`).

### `resolveCommandOnPath(command)` / `canRunCorepack()` / `buildExecEnv()`

Lower-level helpers: Windows-safe executable resolution (prefers `.cmd`
shims via `where.exe`, uses `which` elsewhere), corepack availability, and a
Windows PATH-patched env for spawning.

### `prefersYarn(cwd?)` (default export)

The v1 API: `true` when a `yarn.lock` exists in `cwd` (default
`process.cwd()`).

## Migrating from v1

v1 exported a single function:

```js
const prefersYarn = require('prefers-yarn')
prefersYarn() // boolean
```

In v2 the same function is still there, as both the default and a named
export, but the package now ships ESM + CJS builds, so CJS consumers should
destructure:

```js
// CJS
const { prefersYarn } = require('prefers-yarn')
// ESM
import prefersYarn from 'prefers-yarn'
```

For new code, prefer `detectPackageManager()`: it answers the broader
question ("which package manager?") instead of just "is it yarn?".

v2 requires Node.js >= 18.

## Related projects

* [pintor](https://github.com/cezaraugusto/pintor)
* [log-md](https://github.com/cezaraugusto/log-md)
* [mklicense](https://github.com/cezaraugusto/mklicense)
* [go-git-it](https://github.com/cezaraugusto/go-git-it)
* [git-precision](https://github.com/cezaraugusto/git-precision)
* [isolated-deps](https://github.com/cezaraugusto/isolated-deps)

## License

MIT (c) Cezar Augusto.
