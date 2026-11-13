/** Test fixtures. Everything here is written for these tests: no manufacturer
 * file is copied, and nothing here is evidence about real hardware.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TemplateManifest } from '../src/build/scaffold.js';
import type { HostConfig } from '../src/build/workspace.js';
import { IMAGE, MAILBOX, PINNED } from '../src/registry/sdk-contract.js';

export const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

export async function tempDir(prefix: string): Promise<{ dir: string; close(): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, close: () => rm(dir, { recursive: true, force: true }) };
}

export async function writeFiles(base: string, files: Record<string, string | Buffer>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const target = join(base, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

export function hostConfigFor(overrides: Partial<HostConfig> = {}): HostConfig {
  return {
    workspaceRoot: '', templateDir: '', buildEnabled: false, idfPath: '', idfPython: '',
    buildTimeoutMs: 5000, ...overrides,
  };
}

/** A minimal project that satisfies every static check kode_validate makes. */
export function projectFiles(name: string, options: {
  target?: string; role?: boolean; sdkVersion?: string; manifest?: string; extraSource?: string;
} = {}): Record<string, string | Buffer> {
  const target = options.target ?? 'esp32p4';
  return {
    'CMakeLists.txt': [
      'cmake_minimum_required(VERSION 3.22)', `set(IDF_TARGET ${target})`,
      'if(NOT DEFINED PROJECT_VER)', '    set(PROJECT_VER "0.1.0")', 'endif()',
      'include($ENV{IDF_PATH}/tools/cmake/project.cmake)', `project(${name})`, '',
    ].join('\n'),
    'sdkconfig.defaults': [
      'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"',
      ...(options.role === false ? [] : ['CONFIG_KODEOS_BOOT_ROLE_APP=y']),
      'CONFIG_KODEOS_RADIO=n', 'CONFIG_ESP_HOSTED_ENABLED=n', 'CONFIG_BT_ENABLED=n', '',
    ].join('\n'),
    'main/idf_component.yml': [
      'dependencies:', '  kodediy/kode:', '    git: https://github.com/kodediy/kode-sdk.git',
      '    path: components/kode', `    version: ${options.sdkVersion ?? PINNED.sdk.tag}`, '',
    ].join('\n'),
    'main/app_main.c': [
      '#include "kode.h"', options.manifest ?? 'KODE_APP_MANIFEST("Test app", "tools");',
      'void app_main(void) { kode_init(); }', options.extraSource ?? '', '',
    ].join('\n'),
    'appdata/app.json': '{"kode": "1", "color": "#028AC2", "description": "A test app."}',
    'appdata/icon.png': Buffer.from([137, 80, 78, 71]),
    'LICENSE': '                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007\n(test stub)\n',
  };
}

/** A synthetic ESP image prefix laid out as kapp_desc.h describes. */
export function fakeImage(options: {
  chipId?: number; project?: string; version?: string; idf?: string;
  manifest?: { name: string; category: string; version?: number } | null; size?: number; magic?: number;
} = {}): Buffer {
  const image = Buffer.alloc(Math.max(options.size ?? 4096, IMAGE.prefixLength));
  image[0] = options.magic ?? IMAGE.magic;
  image[1] = 3;
  image.writeUInt16LE(options.chipId ?? 0x0012, IMAGE.chipIdOffset);
  image.writeUInt32LE(IMAGE.idfDescMagic, IMAGE.idfDescOffset);
  image.write(options.version ?? '0.1.0', IMAGE.versionOffset, 'latin1');
  image.write(options.project ?? 'demo_app', IMAGE.projectNameOffset, 'latin1');
  image.write('21:14:03', IMAGE.timeOffset, 'latin1');
  image.write('Nov 13 2026', IMAGE.dateOffset, 'latin1');
  image.write(options.idf ?? 'v6.1', IMAGE.idfVersionOffset, 'latin1');
  const manifest = options.manifest === undefined ? { name: 'Test app', category: 'tools' } : options.manifest;
  if (manifest) {
    image.writeUInt32LE(IMAGE.manifestMagic, IMAGE.manifestOffset);
    image.writeUInt32LE(manifest.version ?? 2, IMAGE.manifestOffset + 4);
    image.write(manifest.name, IMAGE.manifestOffset + 8, 'latin1');
    image.write(manifest.category, IMAGE.manifestOffset + 8 + IMAGE.manifestNameLength, 'latin1');
  }
  return image;
}

/** Build outputs as an app-role ESP-IDF build of the SDK would leave them. */
export function buildOutputs(name: string, image: Buffer, options: { appRole?: boolean; flashFiles?: Record<string, string> } = {}): Record<string, string | Buffer> {
  return {
    [`build/${name}.bin`]: image,
    'build/config/sdkconfig.json': JSON.stringify({ IDF_TARGET: 'esp32p4', KODEOS_BOOT_ROLE_APP: options.appRole ?? true }),
    'build/flasher_args.json': JSON.stringify({
      flash_files: options.flashFiles ?? { [`0x${MAILBOX.offset.toString(16)}`]: `${name}.bin` },
    }),
  };
}

/** A stand-in template with the same anchors the scaffold edits. Its contents
 * are written for the tests; only its shape matches the official template. */
export function standInTemplate(): { files: Record<string, string | Buffer>; manifest: TemplateManifest } {
  const files: Record<string, string | Buffer> = {
    'CMakeLists.txt': 'set(IDF_TARGET esp32p4)\nif(NOT DEFINED PROJECT_VER)\n    set(PROJECT_VER "00.00.01")\nendif()\nproject(my_app)\n',
    'main/app_main.c': '#include "kode.h"\nKODE_APP_MANIFEST("My app", "tools");\nvoid app_main(void) { kode_init(); }\n',
    'main/CMakeLists.txt': 'idf_component_register(\n    SRCS "app_main.c"\n    INCLUDE_DIRS "."\n    REQUIRES kode\n)\n',
    // Like the official manifest, this one explains override_path in a comment:
    // a rule that rejects the word anywhere in the file would reject the real template.
    'main/idf_component.yml': '## Sibling components are declared with override_path upstream; an app never sets it.\ndependencies:\n  kodediy/kode:\n    git: https://github.com/kodediy/kode-sdk.git\n    path: components/kode\n    version: v0.1.0\n',
    'sdkconfig.defaults': 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"\nCONFIG_KODEOS_BOOT_ROLE_APP=y\n',
    'ram_budget.txt': '# check with build/my_app.elf\nstatic_max 364000\n',
    'appdata/app.json': '{"kode": "1", "color": "#028AC2", "description": "An empty app to start from."}',
    'appdata/icon.png': Buffer.from([137, 80, 78, 71, 1, 2, 3]),
    'LICENSE': '                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007\n(test stub)\n',
    'README.md': 'stand-in upstream readme with a raw write-flash 0x1C00000 line\n',
  };
  const manifest = Object.entries(files).map(([path, content]) => {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    return { path, blob: '0'.repeat(40), sha256: sha256(bytes), size: bytes.length, binary: Buffer.isBuffer(content) };
  });
  return { files, manifest };
}

/** A directory that looks like an ESP-IDF checkout to the status reader. */
export async function fakeIdf(base: string, version: [number, number, number], commit: string = PINNED.idf.commit): Promise<{ idfPath: string; idfPython: string }> {
  const idfPath = join(base, 'esp-idf');
  await writeFiles(idfPath, {
    'tools/cmake/version.cmake': `set(IDF_VERSION_MAJOR ${version[0]})\nset(IDF_VERSION_MINOR ${version[1]})\nset(IDF_VERSION_PATCH ${version[2]})\n`,
    'tools/idf.py': '# stand-in; never executed by tests\n',
    '.git/HEAD': `${commit}\n`,
  });
  const idfPython = join(base, 'python.exe');
  await writeFile(idfPython, 'stand-in interpreter; never executed by tests\n');
  return { idfPath, idfPython };
}
