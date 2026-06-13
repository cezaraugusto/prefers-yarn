import { execFileSync, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const localRequire = createRequire(import.meta.url);

export type PackageManagerName = 'pnpm' | 'yarn' | 'npm' | 'bun';

export type PackageManagerResolution = {
  name: PackageManagerName;
  /** Absolute path to the package manager executable, when resolvable. */
  execPath?: string;
  /** Command used to run the package manager indirectly (e.g. node or corepack). */
  runnerCommand?: string;
  /** Arguments prepended before user args when `runnerCommand` is used. */
  runnerArgs?: string[];
};

export type RunCommandOptions = {
  cwd?: string;
  stdio?: 'inherit' | 'ignore' | 'pipe';
};

const userAgentPattern = /(pnpm|yarn|bun|npm)\/([0-9]+\.[0-9]+\.[0-9]+[^ ]*)/i;

function normalizePackageManager(
  value?: string,
): PackageManagerName | undefined {
  if (!value) return undefined;

  const lower = value.toLowerCase().trim();

  if (lower === 'pnpm') return 'pnpm';
  if (lower === 'yarn') return 'yarn';
  if (lower === 'bun') return 'bun';
  if (lower === 'npm') return 'npm';

  return undefined;
}

function inferPackageManagerFromPath(
  value?: string,
): PackageManagerName | undefined {
  if (!value) return undefined;

  const lower = value.toLowerCase();

  if (lower.includes('pnpm')) return 'pnpm';
  if (lower.includes('yarn')) return 'yarn';
  if (lower.includes('bun')) return 'bun';
  if (lower.includes('npm')) return 'npm';

  return undefined;
}

function getPackageManagerOverride(): PackageManagerResolution | undefined {
  const name = normalizePackageManager(process.env.PREFERRED_PACKAGE_MANAGER);
  const execPath =
    process.env.PREFERRED_PM_EXEC_PATH ||
    process.env.npm_execpath ||
    process.env.NPM_EXEC_PATH;

  if (!name && !execPath) return undefined;
  const inferredName = name || inferPackageManagerFromPath(execPath) || 'npm';

  return { name: inferredName, execPath };
}

function detectResolutionFromEnv(): PackageManagerResolution | undefined {
  const userAgent = process.env.npm_config_user_agent || '';
  const execPath = process.env.npm_execpath || process.env.NPM_EXEC_PATH || '';
  if (userAgent.includes('pnpm')) {
    return { name: 'pnpm', execPath: execPath || undefined };
  }
  if (userAgent.includes('yarn')) {
    return { name: 'yarn', execPath: execPath || undefined };
  }
  if (userAgent.includes('bun')) {
    return { name: 'bun', execPath: execPath || undefined };
  }
  if (userAgent.includes('npm')) {
    return { name: 'npm', execPath: execPath || undefined };
  }

  if (execPath) {
    const inferred = inferPackageManagerFromPath(execPath) || 'npm';
    return { name: inferred, execPath };
  }

  return undefined;
}

/**
 * Detects the package manager that invoked the current process, looking only
 * at environment variables (`npm_config_user_agent`, `npm_execpath`,
 * `NPM_EXEC_PATH`, `BUN_INSTALL`). Defaults to `'npm'`.
 */
export function detectPackageManagerFromEnv(): PackageManagerName {
  const userAgent = (process.env.npm_config_user_agent || '').toLowerCase();
  if (userAgent.includes('pnpm')) return 'pnpm';
  if (userAgent.includes('yarn')) return 'yarn';
  if (userAgent.includes('bun')) return 'bun';
  if (userAgent.includes('npm')) return 'npm';

  const execPath = (
    process.env.npm_execpath ||
    process.env.NPM_EXEC_PATH ||
    process.env.BUN_INSTALL ||
    ''
  ).toLowerCase();

  if (execPath.includes('pnpm')) return 'pnpm';
  if (execPath.includes('yarn')) return 'yarn';
  if (execPath.includes('bun')) return 'bun';
  if (execPath.includes('npm')) return 'npm';

  return 'npm';
}

/**
 * Returns a `name@version` spec (e.g. `pnpm@9.9.0`) parsed from
 * `npm_config_user_agent`, or `null` when unavailable.
 */
export function getPackageManagerSpec(): string | null {
  const userAgent = process.env.npm_config_user_agent || '';
  const match = userAgent.match(userAgentPattern);

  if (!match) return null;

  const name = match[1];
  const version = match[2];

  if (!name || !version) return null;

  return `${name.toLowerCase()}@${version}`;
}

/**
 * Returns the package manager name and version parsed from
 * `npm_config_user_agent`, or `null` when unavailable.
 */
export function getPackageManagerVersion(): {
  name: PackageManagerName;
  version: string;
} | null {
  const spec = getPackageManagerSpec();
  if (!spec) return null;

  const [name, version] = spec.split('@');
  const normalized = normalizePackageManager(name);
  if (!normalized || !version) return null;

  return { name: normalized, version };
}

function resolveNpmCliFromNode(execPath: string): string | undefined {
  const execDir = path.dirname(execPath);
  const candidates = [
    path.join(execDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(execDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(execDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return undefined;
}

function resolveBundledNpmCliPath(): string | undefined {
  if (process.env.PREFERRED_PM_EXEC_PATH) {
    const overridePath = process.env.PREFERRED_PM_EXEC_PATH;

    if (overridePath && fs.existsSync(overridePath)) return overridePath;
  }

  try {
    const resolved = localRequire.resolve('npm/bin/npm-cli.js', {
      paths: [process.cwd()],
    });

    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    // ignore
  }
  return resolveNpmCliFromNode(process.execPath);
}

function isWindowsExecutablePath(value?: string) {
  if (!value || process.platform !== 'win32') return false;

  return /\.(cmd|bat|exe)$/i.test(value);
}

function isNodeScriptPath(value?: string) {
  if (!value) return false;

  return /\.(mjs|cjs|js)$/i.test(value);
}

function resolveWindowsCommandPath(command: string) {
  if (process.platform !== 'win32') return undefined;

  try {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const whereExe = path.join(systemRoot, 'System32', 'where.exe');
    const whereCommand = fs.existsSync(whereExe) ? whereExe : 'where';
    const output = execFileSync(whereCommand, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const candidates = String(output)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const cmdMatch = candidates.find((line) => /\.cmd$/i.test(line));

    return cmdMatch || candidates[0];
  } catch {
    return undefined;
  }
}

function resolveUnixCommandPath(command: string) {
  if (process.platform === 'win32') return undefined;

  try {
    const output = execFileSync('which', [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const candidate = String(output).trim();

    return candidate || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a command to an absolute path on the current PATH. On Windows it
 * uses `where.exe` and prefers `.cmd` shims; elsewhere it uses `which`.
 */
export function resolveCommandOnPath(command: string): string | undefined {
  return (
    resolveWindowsCommandPath(command) ||
    resolveUnixCommandPath(command) ||
    undefined
  );
}

/** Returns true when corepack is available and runnable. */
export function canRunCorepack(): boolean {
  try {
    const result = spawnSync('corepack', ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return result?.status === 0;
  } catch {
    return false;
  }
}

/**
 * Detects the preferred package manager by sniffing lockfiles in `cwd`:
 * pnpm-lock.yaml, yarn.lock, bun.lockb / bun.lock, package-lock.json.
 */
export function detectPackageManagerFromLockfile(
  cwd?: string,
): PackageManagerName | undefined {
  if (!cwd) return undefined;
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) return 'npm';
  return undefined;
}

/**
 * Detects the package manager declared in the `packageManager` field of the
 * package.json found in `cwd` (the field corepack reads, e.g. `pnpm@9.9.0`).
 */
export function detectPackageManagerFromPackageJson(
  cwd?: string,
): PackageManagerName | undefined {
  if (!cwd) return undefined;

  const packageJsonPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return undefined;

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      packageManager?: string;
    };
    const declared = String(pkg?.packageManager || '')
      .trim()
      .toLowerCase();

    if (declared.startsWith('pnpm@')) return 'pnpm';
    if (declared.startsWith('yarn@')) return 'yarn';
    if (declared.startsWith('bun@')) return 'bun';
    if (declared.startsWith('npm@')) return 'npm';
  } catch {
    // ignore malformed package.json
  }

  return undefined;
}

function hydrateResolvedPackageManager(
  name: PackageManagerName,
): PackageManagerResolution | undefined {
  const resolvedCommand = resolveCommandOnPath(name);
  if (resolvedCommand) {
    return { name, execPath: resolvedCommand };
  }

  if (name === 'npm') {
    const bundledNpmCli = resolveBundledNpmCliPath();
    if (bundledNpmCli) {
      return {
        name: 'npm',
        execPath: bundledNpmCli,
        runnerCommand: process.execPath,
        runnerArgs: [bundledNpmCli],
      };
    }
  }

  return undefined;
}

/**
 * Fully resolves the package manager to use, in order:
 *
 * 1. Lockfile in `cwd` (pnpm-lock.yaml, yarn.lock, bun.lockb/bun.lock,
 *    package-lock.json)
 * 2. `packageManager` field in the package.json at `cwd` (corepack)
 * 3. Explicit override (`PREFERRED_PACKAGE_MANAGER` /
 *    `PREFERRED_PM_EXEC_PATH` env vars)
 * 4. Environment of the invoking process (`npm_config_user_agent`,
 *    `npm_execpath`)
 * 5. pnpm, yarn, or bun found on PATH
 * 6. corepack (running pnpm through it)
 * 7. The npm CLI bundled with the current Node.js install
 * 8. Plain `npm` as a last resort
 */
export function resolvePackageManager(opts?: {
  cwd?: string;
}): PackageManagerResolution {
  const projectPm =
    detectPackageManagerFromLockfile(opts?.cwd) ||
    detectPackageManagerFromPackageJson(opts?.cwd);
  if (projectPm) {
    const hydrated = hydrateResolvedPackageManager(projectPm);
    if (hydrated) return hydrated;
    return { name: projectPm };
  }

  const override = getPackageManagerOverride();
  if (override) return override;

  const envPm = detectResolutionFromEnv();
  if (envPm) return envPm;

  const candidates: PackageManagerName[] = ['pnpm', 'yarn', 'bun'];
  for (const candidate of candidates) {
    const resolved = resolveCommandOnPath(candidate);
    if (resolved) {
      return { name: candidate, execPath: resolved };
    }
  }

  const corepackPath = resolveCommandOnPath('corepack');
  if (corepackPath || canRunCorepack()) {
    return {
      name: 'pnpm',
      runnerCommand: corepackPath || 'corepack',
      runnerArgs: ['pnpm'],
    };
  }
  const bundledNpmCli = resolveBundledNpmCliPath();
  if (bundledNpmCli) {
    return {
      name: 'npm',
      execPath: bundledNpmCli,
      runnerCommand: process.execPath,
      runnerArgs: [bundledNpmCli],
    };
  }

  return { name: 'npm' };
}

/**
 * Detects which package manager a project prefers. Returns one of
 * `'npm' | 'yarn' | 'pnpm' | 'bun'` using the full resolution order of
 * {@link resolvePackageManager}.
 */
export function detectPackageManager(opts?: {
  cwd?: string;
}): PackageManagerName {
  return resolvePackageManager(opts).name;
}

/**
 * On Windows, returns a process env whose PATH is guaranteed to include the
 * directory of the current Node.js executable (needed so `.cmd` shims can
 * find `node`). Returns `undefined` when no adjustment is needed.
 */
export function buildExecEnv(): NodeJS.ProcessEnv | undefined {
  if (process.platform !== 'win32') return undefined;

  const nodeDir = path.dirname(process.execPath);
  const pathSep = path.delimiter;
  const existing = process.env.PATH || process.env.Path || '';

  if (existing.includes(nodeDir)) return undefined;

  return {
    ...process.env,
    PATH: `${nodeDir}${pathSep}${existing}`.trim(),
    Path: `${nodeDir}${pathSep}${existing}`.trim(),
  };
}

/**
 * Builds the `{command, args}` pair to spawn for a resolved package manager,
 * keeping JS entrypoints under `node` and executing native or Windows shell
 * binaries directly.
 */
export function buildInstallCommand(
  pm: PackageManagerResolution,
  args: string[],
): { command: string; args: string[] } {
  if (pm.runnerCommand) {
    return {
      command: pm.runnerCommand,
      args: [...(pm.runnerArgs || []), ...args],
    };
  }

  if (pm.execPath) {
    if (isWindowsExecutablePath(pm.execPath)) {
      return { command: pm.execPath, args };
    }

    // Keep JS entrypoints under node, but execute native/shell binaries directly.
    if (isNodeScriptPath(pm.execPath)) {
      return { command: process.execPath, args: [pm.execPath, ...args] };
    }

    return { command: pm.execPath, args };
  }

  return { command: pm.name, args };
}

/**
 * Builds an invocation of the npm CLI bundled with the current Node.js
 * install (`node /path/to/npm-cli.js ...args`), or `undefined` when it
 * cannot be located. Useful as a last-resort fallback when no package
 * manager is on PATH.
 */
export function buildNpmCliFallback(
  args: string[],
): { command: string; args: string[] } | undefined {
  const npmCli = resolveBundledNpmCliPath();

  if (!npmCli) return undefined;

  return {
    command: process.execPath,
    args: [npmCli, ...args],
  };
}

/**
 * Spawns a package manager command, handling Windows `.cmd`/`.bat` shells and
 * PATH quirks. Resolves when the process exits with code 0, rejects
 * otherwise.
 */
export function runCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<void> {
  const env = buildExecEnv();
  const stdio = options?.stdio ?? 'ignore';
  // On Windows, .cmd/.bat must be run with shell (spawn EINVAL otherwise)
  const useShell =
    process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio,
      env: env || process.env,
      ...(useShell ? { shell: true } : {}),
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}`));
      } else {
        resolve();
      }
    });

    child.on('error', (error) => reject(error));
  });
}

/**
 * v1-compatible API: returns `true` when the working directory (or `cwd`)
 * contains a `yarn.lock` file.
 */
export function prefersYarn(cwd?: string): boolean {
  return fs.existsSync(path.resolve(cwd || process.cwd(), 'yarn.lock'));
}

export default prefersYarn;
