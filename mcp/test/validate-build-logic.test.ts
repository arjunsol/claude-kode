/** The build-logic gate (review findings 1 and 5): kode_build executes the
 * project's CMake, so a project is eligible only when its build logic is the
 * pinned template's. These tests use the reviewer's exact inputs. The
 * template is a stand-in written for the tests; no manufacturer file is used.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { newApp } from '../src/build/scaffold.js';
import { validateProject, type ValidationOutcome } from '../src/build/validate.js';
import type { HostConfig } from '../src/build/workspace.js';
import { hostConfigFor, projectFiles, standInTemplate, tempDir, writeFiles } from './helpers.js';

const template = standInTemplate();
let ws: Awaited<ReturnType<typeof tempDir>>;
let tpl: Awaited<ReturnType<typeof tempDir>>;
let config: HostConfig;
let counter = 0;

before(async () => {
  ws = await tempDir('kode-bl-ws-');
  tpl = await tempDir('kode-bl-tpl-');
  await writeFiles(tpl.dir, template.files);
  config = hostConfigFor({ workspaceRoot: ws.dir, templateDir: tpl.dir });
});
after(async () => { await ws.close(); await tpl.close(); });

/** A fresh project made by kode_new_app from the stand-in template, left alone. */
async function scaffolded(options: { sdkRelease?: string } = {}): Promise<{ name: string; dir: string }> {
  const name = `bl_app_${counter++}`;
  await newApp(config, { projectName: name, displayName: 'Demo', categories: ['tools'], ...options }, template.manifest);
  return { name, dir: join(ws.dir, name) };
}
const gate = (name: string) => validateProject(config, name, template.manifest);
const failedGate = (outcome: ValidationOutcome) =>
  outcome.buildLogic.findings.filter(f => f.level === 'reject' && f.status === 'fail').map(f => f.rule);
async function rewrite(dir: string, path: string, change: (text: string) => string): Promise<void> {
  await writeFile(join(dir, path), change(await readFile(join(dir, path), 'utf8')));
}
async function assertIneligible(name: string, rule: string): Promise<ValidationOutcome> {
  const outcome = await gate(name);
  assert.equal(outcome.buildLogic.eligible, false, `${name} must not be eligible`);
  assert.ok(failedGate(outcome).includes(rule), `expected ${rule}, got ${failedGate(outcome).join(',')}`);
  return outcome;
}

describe('a project made by kode_new_app and left alone', () => {
  it('is eligible with the manifest it was made from, at either assessed release', async () => {
    for (const sdkRelease of [undefined, 'v0.1.0', 'v0.1.1']) {
      const project = await scaffolded(sdkRelease ? { sdkRelease } : {});
      const outcome = await gate(project.name);
      assert.deepEqual(failedGate(outcome), [], JSON.stringify(outcome.buildLogic.findings));
      assert.equal(outcome.buildLogic.eligible, true);
    }
  });

  it('stays eligible with a source file added to main/ and listed in SRCS', async () => {
    const project = await scaffolded();
    await writeFile(join(project.dir, 'main/extra.c'), 'void extra(void) {}\n');
    await rewrite(project.dir, 'main/CMakeLists.txt', text => text.replace('SRCS "app_main.c"', 'SRCS "app_main.c" "extra.c"'));
    assert.equal((await gate(project.name)).buildLogic.eligible, true);
  });

  it('stays eligible when its text files are rewritten with CRLF line endings', async () => {
    const project = await scaffolded();
    for (const path of ['CMakeLists.txt', 'main/CMakeLists.txt', 'main/idf_component.yml', 'sdkconfig.defaults', 'main/app_main.c']) {
      await rewrite(project.dir, path, text => text.replace(/\n/g, '\r\n'));
    }
    assert.equal((await gate(project.name)).buildLogic.eligible, true);
  });

  it('is not eligible under a different pinned manifest (the real one), so the hash is really compared', async () => {
    const project = await scaffolded();
    const outcome = await validateProject(config, project.name);
    assert.equal(outcome.buildLogic.eligible, false);
    assert.ok(failedGate(outcome).includes('BL-ROOT-CMAKE'));
    assert.ok(failedGate(outcome).includes('BL-SDK-PIN'));
  });

  it('stays eligible with a build/ directory, and a managed_components/ directory only adds a warning', async () => {
    const project = await scaffolded();
    // Neither directory is walked: build output and fetched components hold .cmake files of their own.
    await writeFiles(project.dir, { 'build/CMakeFiles/x.cmake': '# generated\n', 'build/idf_ext.py': '# generated\n', 'managed_components/kodediy__kode/CMakeLists.txt': '# fetched\n', 'managed_components/kodediy__kode/a.cmake': '# fetched\n' });
    const outcome = await gate(project.name);
    assert.equal(outcome.buildLogic.eligible, true, JSON.stringify(outcome.buildLogic.findings));
    assert.ok(outcome.buildLogic.findings.some(f => f.rule === 'BL-UNVERIFIABLE' && f.level === 'warn'));
  });

  it('does not change the verdict: the gate reports separately', async () => {
    const project = await scaffolded();
    const before = (await gate(project.name)).verdict;
    await writeFile(join(project.dir, 'idf_ext.py'), 'x = 1\n');
    const outcome = await assertIneligible(project.name, 'BL-EXTRA-BUILD-FILE');
    assert.equal(outcome.verdict, before);
    assert.ok(!outcome.findings.some(f => f.rule.startsWith('BL-')), 'build-logic findings are not in the main list');
  });
});

describe('the reviewer\'s build-logic bypasses are not eligible', () => {
  it('execute_process added to the root CMakeLists.txt', async () => {
    const project = await scaffolded();
    await rewrite(project.dir, 'CMakeLists.txt', text => `${text}execute_process(COMMAND python -m esptool --port COM3 erase-region 0x0 0x2000000)\n`);
    await assertIneligible(project.name, 'BL-ROOT-CMAKE');
  });

  it('a second set(IDF_TARGET esp32c6)', async () => {
    const project = await scaffolded();
    await rewrite(project.dir, 'CMakeLists.txt', text => `${text}set(IDF_TARGET esp32c6)\n`);
    await assertIneligible(project.name, 'BL-ROOT-CMAKE');
  });

  it('the expected lines hidden inside a #[[ ... ]] bracket comment', async () => {
    const project = await scaffolded();
    await writeFile(join(project.dir, 'CMakeLists.txt'),
      `#[[\nset(IDF_TARGET esp32p4)\nset(PROJECT_VER "0.1.0")\nproject(${project.name})\n]]\nset(IDF_TARGET esp32c6)\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(other_name)\n`);
    await assertIneligible(project.name, 'BL-ROOT-CMAKE');
  });

  it('set(SDKCONFIG_DEFAULTS "evil.defaults")', async () => {
    const project = await scaffolded();
    await rewrite(project.dir, 'CMakeLists.txt', text => text.replace('project(', 'set(SDKCONFIG_DEFAULTS "evil.defaults")\nproject('));
    await writeFile(join(project.dir, 'evil.defaults'), 'CONFIG_PARTITION_TABLE_SINGLE_APP=y\n');
    await assertIneligible(project.name, 'BL-ROOT-CMAKE');
  });

  it('a project idf_ext.py, in any letter case', async () => {
    const project = await scaffolded();
    await writeFile(join(project.dir, 'idf_ext.py'), 'def action_extensions(base_actions, project_path):\n    return {}\n');
    await assertIneligible(project.name, 'BL-EXTRA-BUILD-FILE');
    const upper = await scaffolded();
    await writeFile(join(upper.dir, 'IDF_EXT.PY'), 'x = 1\n');
    await assertIneligible(upper.name, 'BL-EXTRA-BUILD-FILE');
  });

  it('a hostile main/CMakeLists.txt', async () => {
    for (const hostile of [
      'idf_component_register(SRCS app_main.c)\nexecute_process(COMMAND python -m esptool erase_flash)\n',
      'idf_component_register(SRCS "app_main.c" "../../outside.c")\n',
      'idf_component_register(SRCS "/abs/outside.c")\n',
      'idf_component_register(SRCS "$ENV{X}/a.c")\n',
      'idf_component_register(SRCS "a.c;b.c")\n',
      'idf_component_register(SRCS "app_main.c" INCLUDE_DIRS ".")\nidf_component_register(SRCS "x.c")\n',
      'file(GLOB S "*.c")\nidf_component_register(SRCS "app_main.c")\n',
      '#[[ hidden\n]]\nidf_component_register(SRCS "app_main.c")\n',
      'idf_component_register(SRCS "app_main.c" COMMAND_X "y")\n',
      'idf_component_register(SRCS "app_main.c" REQUIRES "kode")\n',
    ]) {
      const project = await scaffolded();
      await writeFile(join(project.dir, 'main/CMakeLists.txt'), hostile);
      await assertIneligible(project.name, 'BL-MAIN-CMAKE');
    }
  });

  it('override_path in any spelling, a quoted kodediy/kbsp key, and a flow mapping', async () => {
    for (const extra of [
      '    override_path : ../../evil_sdk\n',
      '    "override_path": ../../evil_sdk\n',
      '  "kodediy/kbsp":\n    override_path: ../../evil_bsp\n',
      '  kodediy/kbsp: {override_path: ../../evil_bsp}\n',
    ]) {
      const project = await scaffolded();
      await rewrite(project.dir, 'main/idf_component.yml', text => text + extra);
      await assertIneligible(project.name, 'BL-SDK-PIN');
    }
  });

  it('a version line that is not an assessed release, or two version lines', async () => {
    const odd = await scaffolded();
    await rewrite(odd.dir, 'main/idf_component.yml', text => text.replace(/version: v0\.1\.1/, 'version: v9.9.9'));
    await assertIneligible(odd.name, 'BL-SDK-PIN');
    const twice = await scaffolded();
    await rewrite(twice.dir, 'main/idf_component.yml', text => `${text}  kodediy/kbsp:\n    git: https://example.invalid/x.git\n    version: v0.1.1\n`);
    await assertIneligible(twice.name, 'BL-SDK-PIN');
  });

  it('a local components/kbsp directory', async () => {
    const project = await scaffolded();
    await writeFiles(project.dir, { 'components/kbsp/CMakeLists.txt': 'idf_component_register()\n', 'components/kbsp/partitions.csv': 'factory, app, factory, 0x10000, 0x400000\n' });
    const outcome = await assertIneligible(project.name, 'BL-EXTRA-BUILD-FILE');
    assert.ok(outcome.buildLogic.findings.some(f => f.rule === 'BL-EXTRA-BUILD-FILE' && f.message.includes('components')));
  });

  it('a root sdkconfig with "# CONFIG_KODEOS_BOOT_ROLE_APP is not set"', async () => {
    const project = await scaffolded();
    await writeFile(join(project.dir, 'sdkconfig'), '# CONFIG_KODEOS_BOOT_ROLE_APP is not set\nCONFIG_PARTITION_TABLE_SINGLE_APP=y\n');
    await assertIneligible(project.name, 'BL-SDKCONFIG');
  });

  it('a root sdkconfig that sets the role twice, or another chip', async () => {
    const twice = await scaffolded();
    await writeFile(join(twice.dir, 'sdkconfig'), 'CONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_IDF_TARGET="esp32p4"\n# CONFIG_KODEOS_BOOT_ROLE_APP is not set\n');
    await assertIneligible(twice.name, 'BL-SDKCONFIG');
    const chip = await scaffolded();
    await writeFile(join(chip.dir, 'sdkconfig'), 'CONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_IDF_TARGET="esp32c6"\n');
    await assertIneligible(chip.name, 'BL-SDKCONFIG');
  });

  it('a root sdkconfig of the shape a build leaves is accepted, even though it is large', async () => {
    const project = await scaffolded();
    const filler = Array.from({ length: 6000 }, (_, i) => `CONFIG_FILLER_${i}=y`).join('\n');
    await writeFile(join(project.dir, 'sdkconfig'), `CONFIG_IDF_TARGET_ARCH="riscv"\nCONFIG_IDF_TARGET="esp32p4"\nCONFIG_KODEOS_BOOT_ROLE_APP=y\n${filler}\n`);
    const outcome = await gate(project.name);
    assert.equal(outcome.buildLogic.eligible, true, JSON.stringify(failedGate(outcome)));
  });
});

describe('the bounded directory walk', () => {
  it('finds *.cmake files, nested CMakeLists.txt files and per-target defaults, wherever they are', async () => {
    for (const path of ['helpers.cmake', 'main/sub/inc.cmake', 'tools/CMakeLists.txt', 'main/sub/CMakeLists.txt', 'sdkconfig.defaults.esp32p4', 'appdata/sdkconfig.defaults.x', 'a/b/c/d/e/IDF_EXT.py']) {
      const project = await scaffolded();
      await writeFiles(project.dir, { [path]: '# x\n' });
      await assertIneligible(project.name, 'BL-EXTRA-BUILD-FILE');
    }
  });

  it('refuses Kconfig* files in any letter case, but not in the top-level build/ or managed_components/', async () => {
    for (const path of ['main/Kconfig.projbuild', 'Kconfig', 'main/KCONFIG.projbuild', 'tools/sub/kconfig.evil']) {
      const project = await scaffolded();
      await writeFiles(project.dir, { [path]: 'menu "x"\nendmenu\n' });
      await assertIneligible(project.name, 'BL-EXTRA-BUILD-FILE');
    }
    const ok = await scaffolded();
    await writeFiles(ok.dir, { 'build/Kconfig.projbuild': '# generated\n', 'managed_components/x/Kconfig': '# fetched\n' });
    assert.equal((await gate(ok.name)).buildLogic.eligible, true);
  });

  it('skips only the top-level build/ and managed_components/', async () => {
    const project = await scaffolded();
    await writeFiles(project.dir, { 'main/build/idf_ext.py': 'x = 1\n' });
    await assertIneligible(project.name, 'BL-EXTRA-BUILD-FILE');
    const nested = await scaffolded();
    await writeFiles(nested.dir, { 'tools/managed_components/x.cmake': '# x\n' });
    await assertIneligible(nested.name, 'BL-EXTRA-BUILD-FILE');
  });

  it('is not eligible when the project is deeper than the bound', async () => {
    const project = await scaffolded();
    await writeFiles(project.dir, { 'a/b/c/d/e/f/g/deep.txt': 'x\n' });
    await assertIneligible(project.name, 'BL-WALK-BOUND');
  });

  it('is not eligible when the project has more entries than the bound', async () => {
    const project = await scaffolded();
    await mkdir(join(project.dir, 'many'));
    await Promise.all(Array.from({ length: 5100 }, (_, i) => writeFile(join(project.dir, 'many', `f${i}.txt`), '')));
    await assertIneligible(project.name, 'BL-WALK-BOUND');
  });

  it('does not follow a link, and reports a link at the top level, in main/ and in appdata/', async () => {
    const outside = await tempDir('kode-bl-outside-');
    try {
      await writeFiles(outside.dir, { 'idf_ext.py': 'x = 1\n', 'evil.cmake': '# x\n' });
      for (const where of ['docs', 'main/linked', 'appdata/linked']) {
        const project = await scaffolded();
        await mkdir(dirname(join(project.dir, where)), { recursive: true });
        await symlink(outside.dir, join(project.dir, where), 'junction');
        const outcome = await assertIneligible(project.name, 'BL-LINK');
        // The link is reported, not walked: the files behind it are not listed as the project's own.
        assert.ok(!failedGate(outcome).includes('BL-EXTRA-BUILD-FILE'), `${where}: a link was followed`);
        assert.deepEqual((await readdir(outside.dir)).sort(), ['evil.cmake', 'idf_ext.py']);
      }
    } finally {
      await outside.close();
    }
  });

  it('refuses a top-level build/ that is a link', async () => {
    const outside = await tempDir('kode-bl-outside-');
    try {
      const project = await scaffolded();
      await symlink(outside.dir, join(project.dir, 'build'), 'junction');
      await assertIneligible(project.name, 'BL-LINK');
    } finally {
      await outside.close();
    }
  });
});

describe('validation of a hand-made project stays a harmless read', () => {
  it('passes the verdict but is not eligible when it is not the template\'s build logic', async () => {
    const name = 'hand_made';
    await writeFiles(join(ws.dir, name), projectFiles(name));
    const outcome = await validateProject(config, name);
    assert.equal(outcome.verdict, 'pass');
    assert.equal(outcome.buildLogic.eligible, false);
  });
});

/** Rules B1 and B2 on hand-made projects: the reviewer's inputs that fooled them (t1-validate.mts, t1b.mts). */
describe('B1 and B2 are not fooled by the reviewer\'s inputs', () => {
  const failed = async (name: string, extra: Record<string, string>) => {
    await writeFiles(join(ws.dir, name), { ...projectFiles(name), ...extra });
    const outcome = await validateProject(config, name);
    return outcome.findings.filter(f => f.level === 'reject' && f.status === 'fail').map(f => f.rule);
  };
  const yml = (extra: string) => `dependencies:\n  kodediy/kode:\n    git: https://github.com/kodediy/kode-sdk.git\n    path: components/kode\n    version: v0.1.1\n${extra}`;

  it('B2 fails on a second set(IDF_TARGET esp32c6) after a correct first one', async () => {
    assert.ok((await failed('tgt2', { 'CMakeLists.txt': 'set(IDF_TARGET esp32p4)\nset(IDF_TARGET esp32c6)\nset(PROJECT_VER "0.1.0")\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(tgt2)\n' })).includes('B2'));
  });

  it('B2 and A2 fail when the expected lines sit inside a bracket comment', async () => {
    const rules = await failed('brk', { 'CMakeLists.txt': '#[[\nset(IDF_TARGET esp32p4)\nset(PROJECT_VER "0.1.0")\nproject(brk)\n]]\nset(IDF_TARGET esp32c6)\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(other_name)\n' });
    assert.ok(rules.includes('B2') && rules.includes('A2'));
  });

  it('B2 still passes a plain project, and one that sets the target twice to the same chip', async () => {
    assert.ok(!(await failed('tgt_ok', {})).includes('B2'));
    assert.ok(!(await failed('tgt_same', { 'CMakeLists.txt': 'set(IDF_TARGET esp32p4)\nset(IDF_TARGET esp32p4)\nset(PROJECT_VER "0.1.0")\nproject(tgt_same)\n' })).includes('B2'));
  });

  it('B1 fails on override_path with a space before the colon, and on a quoted override_path', async () => {
    assert.ok((await failed('y1', { 'main/idf_component.yml': yml('    override_path : ../../evil_sdk\n') })).includes('B1'));
    assert.ok((await failed('y2', { 'main/idf_component.yml': yml('    "override_path": ../../evil_sdk\n') })).includes('B1'));
  });

  it('B1 fails on a quoted kodediy/kbsp key, listed first or last, and on a flow mapping', async () => {
    assert.ok((await failed('y3', { 'main/idf_component.yml': yml('  "kodediy/kbsp":\n    override_path: ../../evil_bsp\n') })).includes('B1'));
    const first = 'dependencies:\n  "kodediy/kbsp":\n    override_path: ../../evil_bsp\n  kodediy/kode:\n    git: https://github.com/kodediy/kode-sdk.git\n    path: components/kode\n    version: v0.1.1\n';
    assert.ok((await failed('y3b', { 'main/idf_component.yml': first })).includes('B1'));
    assert.ok((await failed('y4', { 'main/idf_component.yml': yml('  kodediy/kbsp: {override_path: ../../evil_bsp}\n') })).includes('B1'));
  });

  it('B1 reads a quoted key with a trailing comment as the dependency it is', async () => {
    const rules = await failed('y5', { 'main/idf_component.yml': 'dependencies:\n  "kodediy/kode":   # the SDK\n    git: https://github.com/kodediy/kode-sdk.git\n    path: components/kode\n    version: v0.1.1\n' });
    assert.ok(!rules.includes('B1'));
  });
});

describe('B1 sees override_path wherever it is written', () => {
  it('fails on an override_path at an indentation the block parser does not model', async () => {
    const name = 'y6';
    const text = 'dependencies:\n  kodediy/kode:\n    git: https://github.com/kodediy/kode-sdk.git\n    path: components/kode\n    version: v0.1.1\n  other/dep:\n   OVERRIDE_PATH: ../../evil\n';
    await writeFiles(join(ws.dir, name), { ...projectFiles(name), 'main/idf_component.yml': text });
    const outcome = await validateProject(config, name);
    assert.ok(outcome.findings.some(f => f.rule === 'B1' && f.status === 'fail'));
  });
});

/** Rule C12 (finding 4): recursive, more extensions, whole identifiers with or without "(" (t6-c12.mts). */
describe('C12 sees the flash and OTA identifiers the review showed it missing', () => {
  const MANIFEST = 'KODE_APP_MANIFEST("T", "tools");\n';
  const c12 = async (name: string, extra: Record<string, string | Buffer>) => {
    await writeFiles(join(ws.dir, name), { ...projectFiles(name), ...extra });
    const outcome = await validateProject(config, name);
    return outcome.findings.find(f => f.rule === 'C12')!;
  };
  let n = 0;

  it('fails on each family, as a call, as a function pointer, and in files below main/ or with other extensions', async () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['esp_partition_write_raw', { 'main/app_main.c': `${MANIFEST}void f(void){ esp_partition_write_raw(p, 0, b, 4); }\n` }],
      ['esp_flash_write_encrypted', { 'main/app_main.c': `${MANIFEST}void f(void){ esp_flash_write_encrypted(NULL, 0, b, 4); }\n` }],
      ['esp_rom_spiflash_erase_chip', { 'main/app_main.c': `${MANIFEST}void f(void){ esp_rom_spiflash_erase_chip(); }\n` }],
      ['esp_rom_spiflash_write_encrypted_enable', { 'main/app_main.c': `${MANIFEST}void f(void){ esp_rom_spiflash_write_encrypted_enable(); }\n` }],
      ['bootloader_flash_write', { 'main/app_main.c': `${MANIFEST}void f(void){ bootloader_flash_write(0, b, 4, false); }\n` }],
      ['nvs_flash_erase', { 'main/app_main.c': `${MANIFEST}void f(void){ nvs_flash_erase(); }\n` }],
      ['nvs_flash_erase_partition', { 'main/app_main.c': `${MANIFEST}void f(void){ nvs_flash_erase_partition("x"); }\n` }],
      ['spi_flash_write', { 'main/app_main.c': `${MANIFEST}void f(void){ spi_flash_write(0, b, 4); }\n` }],
      ['function pointer', { 'main/app_main.c': `${MANIFEST}static void *w = (void*)esp_partition_erase_range;\n` }],
      ['esp_ota with a space before the paren', { 'main/app_main.c': `${MANIFEST}void f(void){ esp_ota_begin (0,0,0); }\n` }],
      ['name after a slash-star inside a string', { 'main/app_main.c': `${MANIFEST}const char *s = "/*"; void f(void){ esp_ota_begin(0,0,0); } /* */\n` }],
      ['main/sub/evil.c', { 'main/sub/evil.c': 'void f(void){ esp_ota_begin(0,0,0); }\n' }],
      ['main/a/b/c/evil.c', { 'main/a/b/c/evil.c': 'void f(void){ esp_ota_begin(0,0,0); }\n' }],
      ['main/evil.cc', { 'main/evil.cc': 'void f(void){ esp_ota_begin(0,0,0); }\n' }],
      ['main/evil.cxx', { 'main/evil.cxx': 'void f(void){ esp_ota_begin(0,0,0); }\n' }],
      ['main/evil.hh', { 'main/evil.hh': 'static inline void f(void){ esp_ota_begin(0,0,0); }\n' }],
      ['main/evil.inc', { 'main/evil.inc': 'esp_ota_begin(0,0,0);\n' }],
      ['main/evil.S', { 'main/evil.S': '    call esp_flash_write\n' }],
      ['main/evil.s', { 'main/evil.s': '    call esp_flash_erase_chip\n' }],
    ];
    for (const [label, extra] of cases) {
      const finding = await c12(`c12_${n++}`, extra);
      assert.equal(finding.status, 'fail', `${label} must fail C12`);
    }
  });

  it('fails on any text file under main/, whatever its extension, and on a name split by a line splice', async () => {
    const call = 'void f(void){ esp_ota_begin(0,0,0); }\n';
    const cases: Array<[string, Record<string, string>]> = [
      ['main/evil.c++', { 'main/evil.c++': call }],
      ['main/evil.cp', { 'main/evil.cp': call }],
      ['main/evil.sx', { 'main/evil.sx': call }],
      ['main/evil.hxx', { 'main/evil.hxx': call }],
      ['main/evil.C', { 'main/evil.C': call }],
      ['#included main/payload.txt', { 'main/payload.txt': call, 'main/inc.c': '#include "payload.txt"\n' }],
      ['splice with LF', { 'main/evil.c': 'void f(void){ esp_o\\\nta_begin(0,0,0); }\n' }],
      ['splice with CRLF', { 'main/evil.c': 'void f(void){ esp_o\\\r\nta_begin(0,0,0); }\r\n' }],
    ];
    for (const [label, extra] of cases) {
      assert.equal((await c12(`c12_${n++}`, extra)).status, 'fail', `${label} must fail C12`);
    }
  });

  it('skips a binary file under main/ of any size instead of rejecting it', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), Buffer.alloc(200 * 1024, 0x61)]);
    const small = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0x65, 0x73, 0x70, 0x5f, 0x6f, 0x74, 0x61, 0x5f, 0x62, 0x65, 0x67, 0x69, 0x6e]);
    const name = `c12_${n++}`;
    await writeFiles(join(ws.dir, name), { ...projectFiles(name), 'main/logo.png': png, 'main/tiny.bin': small });
    const outcome = await validateProject(config, name);
    assert.equal(outcome.findings.find(f => f.rule === 'C12')?.status, 'pass');
    assert.ok(!outcome.findings.some(f => f.rule === 'CK-FILE-BOUND'));
    assert.equal(outcome.verdict, 'pass');
  });

  it('warns, without changing the verdict, when a source includes a path that leaves main/', async () => {
    const plain = await c12(`c12_${n++}`, { 'main/inc.c': '#include "inc.h"\n' });
    assert.equal(plain.status, 'pass');
    for (const target of ['"../evil.h"', '<../evil.h>', '"sub/../../evil.h"']) {
      const name = `c12_${n++}`;
      await writeFiles(join(ws.dir, name), { ...projectFiles(name), 'evil.h': 'static inline void f(void){ esp_ota_begin(0,0,0); }\n', 'main/inc.c': `#include ${target}\r\n` });
      const outcome = await validateProject(config, name);
      const warning = outcome.findings.find(f => f.rule.startsWith('C12') && f.level === 'warn');
      assert.ok(warning && warning.status === 'fail', `${target} must warn`);
      assert.match(warning.message, /not scanned/);
      assert.equal(outcome.verdict, 'pass', 'a warning does not change the verdict');
      assert.equal(outcome.findings.find(f => f.rule === 'C12' && f.level === 'reject')?.status, 'pass');
    }
  });

  it('does not fail on comments, longer names that merely contain a family, or reads', async () => {
    const finding = await c12(`c12_${n++}`, {
      'main/app_main.c': `${MANIFEST}// never call esp_ota_begin here\n/* esp_partition_write is forbidden */\nvoid f(void){ my_esp_ota_begin(); esp_partition_read(p,0,b,4); esp_flash_read(0,0,b,4); }\n`,
    });
    assert.equal(finding.status, 'pass');
  });

  it('says it is a source heuristic, and the reviewer\'s token-pasting case still passes (it is not a guarantee)', async () => {
    const finding = await c12(`c12_${n++}`, { 'main/app_main.c': `${MANIFEST}#define J(a,b) a##b\nvoid f(void){ J(esp_ota_,begin)(0,0,0); }\n` });
    assert.equal(finding.status, 'pass');
    assert.match(finding.message, /heuristic/);
    assert.match(finding.message, /built ELF/);
    const failing = await c12(`c12_${n++}`, { 'main/sub/evil.c': 'void f(void){ esp_ota_begin(0,0,0); }\n' });
    assert.match(failing.message, /heuristic/);
  });

  it('cannot pass when main/ is too large to scan completely', async () => {
    const wide: Record<string, string> = {};
    for (let i = 0; i < 520; i += 1) wide[`main/gen/f${i}.c`] = 'void g(void) {}\n';
    assert.equal((await c12(`c12_${n++}`, wide)).status, 'fail');
    assert.equal((await c12(`c12_${n++}`, { 'main/a/b/c/d/e/f/deep.c': 'void g(void) {}\n' })).status, 'fail');
  });
});

/** Finding 6: a bounded parse. The first test is the reviewer's t2b-redos-max.mts input. */
describe('no parsed file can freeze the server', () => {
  const validated = async (name: string, extra: Record<string, string | Buffer>) => {
    await writeFiles(join(ws.dir, name), { ...projectFiles(name), ...extra });
    const started = performance.now();
    const outcome = await validateProject(config, name);
    return { outcome, ms: performance.now() - started };
  };
  const boundFiles = (outcome: ValidationOutcome) => outcome.findings.filter(f => f.rule === 'CK-FILE-BOUND' && f.status === 'fail').map(f => f.message);
  const yml = 'dependencies:\n  kodediy/kode:\n    git: https://github.com/kodediy/kode-sdk.git\n    path: components/kode\n    version: v0.1.1\n';

  it('validates a 512 KiB line of spaces in main/idf_component.yml in under 2 seconds and says it was not parsed', { timeout: 300000 }, async () => {
    const { outcome, ms } = await validated('redos_yml', { 'main/idf_component.yml': `${yml}${' '.repeat(512 * 1024 - 200)}x\n` });
    assert.ok(ms < 2000, `took ${ms.toFixed(0)} ms`);
    assert.equal(boundFiles(outcome).length, 1);
    assert.match(boundFiles(outcome)[0]!, /idf_component\.yml/);
    assert.equal(outcome.verdict, 'fail');
  });

  it('is fast on a line of spaces just under the file bound, and a line of 4100 characters is within the line bound', { timeout: 300000 }, async () => {
    const small = await validated('redos_yml2', { 'main/idf_component.yml': `${yml}${' '.repeat(60 * 1024)}x\n` });
    assert.ok(small.ms < 2000, `took ${small.ms.toFixed(0)} ms`);
    assert.equal(boundFiles(small.outcome).length, 1, 'a line over 4096 characters is over the bound');
    const lines = await validated('redos_yml3', { 'main/idf_component.yml': `${yml}${' '.repeat(4000)}# ${' '.repeat(90)}\n` });
    assert.equal(boundFiles(lines.outcome).length, 0, 'a 4092-character line of spaces and a comment is within the bound');
  });

  // The old C comment regex measured fast in V8 (4 ms at 512 KiB), so this guards the
  // hand-written scanner against becoming quadratic; it is not a reproduction of a hang.
  it('is fast on unclosed C comments just under the file bound', { timeout: 300000 }, async () => {
    const { outcome, ms } = await validated('redos_c', { 'main/pad.c': '/*\n'.repeat(21000) });
    assert.ok(ms < 1000, `took ${ms.toFixed(0)} ms`);
    assert.equal(boundFiles(outcome).length, 0);
    const dense = await validated('redos_c2', { 'main/pad.c': `${'/*'.repeat(2040)}\n`.repeat(31) });
    assert.ok(dense.ms < 1000, `took ${dense.ms.toFixed(0)} ms`);
  });

  it('applies the bound to every file it parses', { timeout: 300000 }, async () => {
    const huge = `${'a '.repeat(150 * 1024)}\n`;
    for (const path of ['CMakeLists.txt', 'sdkconfig.defaults', 'LICENSE', 'README.md', 'main/app_main.c', 'main/extra.cpp']) {
      const { outcome, ms } = await validated(`bound_${counter++}`, { [path]: huge });
      assert.ok(ms < 2000, `${path} took ${ms.toFixed(0)} ms`);
      assert.ok(boundFiles(outcome).some(message => message.includes(path)), `${path} was not reported as over the bound`);
    }
  });

  it('applies the bound to the build-logic gate too: an over-bound root CMakeLists.txt is not eligible', async () => {
    const project = await scaffolded();
    await writeFile(join(project.dir, 'CMakeLists.txt'), `${' '.repeat(300 * 1024)}\n`);
    const outcome = await assertIneligible(project.name, 'BL-ROOT-CMAKE');
    assert.ok(boundFiles(outcome).length >= 1);
  });
});

/** Finding 13, validation's part: a value taken from a project file is capped before it is echoed. */
describe('values echoed from a project file are capped at 64 characters', () => {
  it('caps the project() token, the target, the version and a file name', async () => {
    const name = 'echo_cap';
    const long = 'q'.repeat(3000);
    await writeFiles(join(ws.dir, name), {
      ...projectFiles(name),
      'CMakeLists.txt': `set(IDF_TARGET ${long})\nset(PROJECT_VER "${'9'.repeat(3000)}.0.0")\nproject(${long})\n`,
      [`sdkconfig.defaults.${'z'.repeat(200)}`]: 'x\n',
      [`${'n'.repeat(200)}.md`]: 'write-flash 0x0 x.bin\n',
    });
    const outcome = await validateProject(config, name);
    for (const finding of outcome.findings) {
      assert.ok(finding.message.length < 700, `${finding.rule} message is ${finding.message.length} characters`);
      assert.ok(!finding.message.includes('q'.repeat(65)), `${finding.rule} echoes more than 64 characters`);
      assert.ok(!finding.message.includes('9'.repeat(65)), `${finding.rule} echoes the version unbounded`);
      assert.ok(!finding.message.includes('z'.repeat(65)) && !finding.message.includes('n'.repeat(65)), `${finding.rule} echoes a file name unbounded`);
    }
    assert.ok(outcome.findings.some(f => f.rule === 'A2' && f.message.includes('q'.repeat(64))), 'the first 64 characters are still shown');
    assert.ok(outcome.findings.some(f => f.rule === 'B5' && f.status === 'fail'));
    assert.ok(outcome.findings.some(f => f.rule === 'CK-RAWFLASH'));
  });
});
