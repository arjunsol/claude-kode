/** Workflow 1, package P1: the build gate and the static configuration rules read
 * every input the build reads (review findings F1, F2 static half and F3, plus the
 * sdkconfig.rename inversion found while planning). The template is the stand-in
 * written for the tests; no manufacturer file is used.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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
  ws = await tempDir('kode-wf1-gate-ws-');
  tpl = await tempDir('kode-wf1-gate-tpl-');
  await writeFiles(tpl.dir, template.files);
  config = hostConfigFor({ workspaceRoot: ws.dir, templateDir: tpl.dir });
});
after(async () => { await ws.close(); await tpl.close(); });

async function scaffolded(): Promise<{ name: string; dir: string }> {
  const name = `wf1_app_${counter++}`;
  await newApp(config, { projectName: name, displayName: 'Demo', categories: ['tools'] }, template.manifest);
  return { name, dir: join(ws.dir, name) };
}
const gate = (name: string) => validateProject(config, name, template.manifest);
const failedGate = (outcome: ValidationOutcome) =>
  outcome.buildLogic.findings.filter(f => f.level === 'reject' && f.status === 'fail');
async function put(dir: string, rel: string, text: string): Promise<void> {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), text);
}

describe('A. a build input the server has not modelled is not eligible', () => {
  const refused = [
    'CMakePresets.json', 'CMakeUserPresets.json', 'cmakepresets.JSON', 'main/CMakePresets.json',
    'main/sdkconfig.rename', 'main/sdkconfig.rename.esp32p4',
  ];
  for (const file of refused) {
    it(`${file} is refused under BL-EXTRA-BUILD-FILE, naming the file, and the verdict is unchanged`, async () => {
      const project = await scaffolded();
      const verdict = (await gate(project.name)).verdict;
      await put(project.dir, file, '{}\n');
      const outcome = await gate(project.name);
      assert.equal(outcome.buildLogic.eligible, false);
      const extra = failedGate(outcome).find(f => f.rule === 'BL-EXTRA-BUILD-FILE');
      assert.ok(extra, `expected BL-EXTRA-BUILD-FILE, got ${failedGate(outcome).map(f => f.rule).join(',')}`);
      assert.ok(extra.message.includes(file), extra.message);
      assert.equal(outcome.verdict, verdict);
    });
  }

  const allowed: Array<[string, string]> = [
    ['presets.json', 'presets.json'], ['main/notes.json', 'main/notes.json'],
    ['build/CMakePresets.json', 'build/CMakePresets.json'],
    ['managed_components/x/CMakePresets.json', 'managed_components/x/CMakePresets.json'],
    ['build/sdkconfig.rename', 'build/sdkconfig.rename'],
  ];
  for (const [label, file] of allowed) {
    it(`${label} does not make the project ineligible`, async () => {
      const project = await scaffolded();
      await put(project.dir, file, '{}\n');
      const outcome = await gate(project.name);
      assert.deepEqual(failedGate(outcome).map(f => f.rule), [], JSON.stringify(outcome.buildLogic.findings));
      assert.equal(outcome.buildLogic.eligible, true);
    });
  }
});

/** A hand-made project whose sdkconfig.defaults is the stock one plus `extra` lines. */
async function validateDefaults(extra: string[], options: { replace?: string } = {}): Promise<ValidationOutcome> {
  const name = `wf1_cfg_${counter++}`;
  const files = projectFiles(name);
  const stock = files['sdkconfig.defaults'] as string;
  await writeFiles(join(ws.dir, name), { ...files, 'sdkconfig.defaults': options.replace ?? `${stock}${extra.join('\n')}\n` });
  return validateProject(config, name);
}
const failedRules = (outcome: ValidationOutcome) =>
  outcome.findings.filter(f => f.level === 'reject' && f.status === 'fail').map(f => f.rule);

describe('B. sdkconfig.defaults is read as Kconfig reads it', () => {
  const refusals: Array<[string, string[], string]> = [
    ['the unset form of HOME_HOLD', ['# CONFIG_KODEOS_HOME_HOLD is not set'], 'D8'],
    ['the unset form of HOME_HOLD, indented', ['  # CONFIG_KODEOS_HOME_HOLD is not set'], 'D8'],
    ['the unset form of HOME_HOLD with trailing text', ['# CONFIG_KODEOS_HOME_HOLD is not set (off)'], 'D8'],
    ['the unset form of AO_WATCH', ['# CONFIG_KQP_AO_WATCH is not set'], 'C2-WATCH'],
    ['HOME_HOLD=n and then =y (every assignment is judged)', ['CONFIG_KODEOS_HOME_HOLD=n', 'CONFIG_KODEOS_HOME_HOLD=y'], 'D8'],
    ['AO_WATCH=n and then =y', ['CONFIG_KQP_AO_WATCH=n', 'CONFIG_KQP_AO_WATCH=y'], 'C2-WATCH'],
    ['the OS role set after the app role', ['CONFIG_KODEOS_BOOT_ROLE_OS=y'], 'B4'],
    ['the app role unset after the app role', ['# CONFIG_KODEOS_BOOT_ROLE_APP is not set'], 'B4'],
    ['an indented CONFIG_KODEOS_HOME_HOLD=n', ['   CONFIG_KODEOS_HOME_HOLD=n'], 'D8'],
    ['G1-1 a lone CR line break before HOME_HOLD=n', ['# note\rCONFIG_KODEOS_HOME_HOLD=n'], 'D8'],
    ['G1-1 a lone CR before the unset form of AO_WATCH', ['# note\r# CONFIG_KQP_AO_WATCH is not set'], 'C2-WATCH'],
    ['G1-1 a lone CR before the OS role', ['# note\rCONFIG_KODEOS_BOOT_ROLE_OS=y'], 'B4'],
    ['G1-1 a lone CR before the partition table', ['# note\rCONFIG_PARTITION_TABLE_CUSTOM_FILENAME="mine.csv"'], 'B3'],
    ['G1-1 a lone CR before CONFIG_ESP_HOSTED_ENABLED=y (radio is off)', ['# note\rCONFIG_ESP_HOSTED_ENABLED=y'], 'B7'],
    ['G1-1 a CR-only file with HOME_HOLD=n on line 2', ['x\rCONFIG_KODEOS_HOME_HOLD=n\rCONFIG_A=1'], 'D8'],
    ['G1-1 an inline comment after HOME_HOLD=n', ['CONFIG_KODEOS_HOME_HOLD=n # off'], 'D8'],
    ['G1-1 an inline comment after CONFIG_ESP_HOSTED_ENABLED=y (radio is off)', ['CONFIG_ESP_HOSTED_ENABLED=y # on'], 'B7'],
    ['G1-1 an inline comment after a partition table that is not the board package\'s', ['CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="mine.csv" # mine'], 'B3'],
    ['G1-1 a tab then an inline comment after the OS role', ['CONFIG_KODEOS_BOOT_ROLE_OS=y\t# os'], 'B4'],
    // G2-1: these three were controls that passed in round two. The grammar now refuses an inline comment
    // after a value and a lone CR, so they are refused, under the grammar rule.
    ['G1-1 HOME_HOLD=y with an inline comment (was a control)', ['CONFIG_KODEOS_HOME_HOLD=y # keep'], 'CK-DEFAULTS-GRAMMAR'],
    ['G1-1 the stock partition table with an inline comment (was a control)', ['CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv" # stock'], 'CK-DEFAULTS-GRAMMAR'],
    ['G1-1 a lone CR before a harmless assignment (was a control)', ['# note\rCONFIG_KLOG_MAXIMUM_LEVEL_WARN=y'], 'CK-DEFAULTS-GRAMMAR'],
  ];
  for (const [label, lines, rule] of refusals) {
    it(`${rule} fails on ${label}`, async () => {
      const outcome = await validateDefaults(lines);
      assert.ok(failedRules(outcome).includes(rule), `expected ${rule}, got ${failedRules(outcome).join(',')}`);
    });
  }

  it('B7 fails on the unset form of the radio without the two companion lines', async () => {
    const outcome = await validateDefaults([], {
      replace: 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"\nCONFIG_KODEOS_BOOT_ROLE_APP=y\n# CONFIG_KODEOS_RADIO is not set\n',
    });
    assert.ok(failedRules(outcome).includes('B7'), failedRules(outcome).join(','));
  });

  it('G1-1 B7 fails on a radio turned off with an inline comment while esp-hosted is on', async () => {
    const outcome = await validateDefaults([], {
      replace: 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"\nCONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_KODEOS_RADIO=n # off\nCONFIG_ESP_HOSTED_ENABLED=y\nCONFIG_BT_ENABLED=n\n',
    });
    assert.ok(failedRules(outcome).includes('B7'), failedRules(outcome).join(','));
  });

  it('B7 passes when the radio is unset together with the unset forms of the companions', async () => {
    const outcome = await validateDefaults([], {
      replace: 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"\nCONFIG_KODEOS_BOOT_ROLE_APP=y\n# CONFIG_KODEOS_RADIO is not set\n# CONFIG_ESP_HOSTED_ENABLED is not set\n# CONFIG_BT_ENABLED is not set\n',
    });
    assert.ok(!failedRules(outcome).includes('B7'), failedRules(outcome).join(','));
  });

  it('B7 keeps the last value: a radio turned off and back on needs nothing', async () => {
    const outcome = await validateDefaults(['CONFIG_KODEOS_RADIO=y']);
    assert.ok(!failedRules(outcome).includes('B7'), failedRules(outcome).join(','));
  });

  it('keeps passing the stock project', async () => {
    const outcome = await validateDefaults([]);
    assert.deepEqual(failedRules(outcome), []);
    assert.equal(outcome.verdict, 'pass');
  });

  const controls: Array<[string, string[]]> = [
    ['an explicit CONFIG_KODEOS_HOME_HOLD=y', ['CONFIG_KODEOS_HOME_HOLD=y']],
    ['an explicit CONFIG_KQP_AO_WATCH=y', ['CONFIG_KQP_AO_WATCH=y']],
    ['the OS role unset', ['# CONFIG_KODEOS_BOOT_ROLE_OS is not set']],
    ['the OS role set to n', ['CONFIG_KODEOS_BOOT_ROLE_OS=n']],
    ['a comment that is not an unset line', ['# CONFIG_KLOG_MAXIMUM_LEVEL_WARN=y', '# CONFIG_KODEOS_HOME_HOLD=n']],
    ['the app role repeated as y', ['CONFIG_KODEOS_BOOT_ROLE_APP=y']],
    ['G1-1 a # inside a quoted string is not a comment', ['CONFIG_KODEOS_APP_NAME="a # b"']],
  ];
  for (const [label, lines] of controls) {
    it(`still passes with ${label}`, async () => {
      const outcome = await validateDefaults(lines);
      assert.deepEqual(failedRules(outcome), []);
    });
  }
});

/** A hand-made project with `source` as main/x.c; returns the C12 findings. */
async function c12(source: string): Promise<{ c12: ValidationOutcome['findings']; include: ValidationOutcome['findings'] }> {
  const name = `wf1_c12_${counter++}`;
  await writeFiles(join(ws.dir, name), { ...projectFiles(name), 'main/x.c': source });
  const outcome = await validateProject(config, name);
  return {
    c12: outcome.findings.filter(f => f.rule === 'C12'),
    include: outcome.findings.filter(f => f.rule === 'C12-INCLUDE'),
  };
}

describe('C. the C12 line splice and include warning', () => {
  it('K0 control: a direct esp_ota_ call fails C12', async () => {
    assert.equal((await c12('void f(void){ esp_ota_begin(0,0,0); }\n')).c12[0]?.status, 'fail');
  });
  it('K6 control: a backslash-newline splice inside a name fails C12', async () => {
    assert.equal((await c12('void f(void){ esp_ota_\\\nbegin(0,0,0); }\n')).c12[0]?.status, 'fail');
  });
  it('K5 a backslash, spaces and a newline inside a name fails C12', async () => {
    assert.equal((await c12('void f(void){ esp_ota_\\  \nbegin(0,0,0); }\n')).c12[0]?.status, 'fail');
  });
  it('a backslash, tab, form feed and CRLF inside a name fails C12', async () => {
    assert.equal((await c12('void f(void){ esp_ota_\\\t\f\r\nbegin(0,0,0); }\n')).c12[0]?.status, 'fail');
  });

  it('K1 control: #include "../evil.h" warns', async () => {
    const found = await c12('#include "../evil.h"\nvoid f(void){}\n');
    assert.equal(found.include.length, 1);
    assert.ok(found.include[0]?.message.includes('not scanned'));
  });
  const warned: Array<[string, string]> = [
    ['K2 an absolute path', '#include "/work/evil.h"'],
    ['an absolute path with a drive letter', '#include "C:/work/evil.h"'],
    ['an absolute path with a backslash', '#include "\\work\\evil.h"'],
    ['K3 a macro operand', '#define H "../evil.h"\n#include H'],
    ['K4 the digraph %:include', '%:include "../evil.h"'],
    ['the trigraph ??=include', '??=include "../evil.h"'],
    ['include_next', '#include_next "../evil.h"'],
    ['import', '#import "../evil.h"'],
    ['an angle path with ..', '#include <../evil.h>'],
    ['spaces between # and include', '  #  include "../evil.h"'],
  ];
  for (const [label, line] of warned) {
    it(`${label} warns that the target is not scanned`, async () => {
      const found = await c12(`${line}\nvoid f(void){}\n`);
      assert.equal(found.include.length, 1, JSON.stringify(found.include));
      assert.equal(found.include[0]?.level, 'warn');
      assert.ok(found.include[0]?.message.includes('not scanned'));
      assert.equal(found.c12[0]?.status, 'pass');
    });
  }
  for (const plain of ['#include "inc.h"', '#include "sub/inc.h"', '#include <stdio.h>', '%:include "inc.h"']) {
    it(`${plain} gets no warning`, async () => {
      assert.equal((await c12(`${plain}\nvoid f(void){}\n`)).include.length, 0);
    });
  }

  // G1-1/G1-2: a C preprocessor (clang -E and gcc -E) reads each of these as the test expects.
  it('Q1 a CR-only splice inside a name fails C12', async () => {
    assert.equal((await c12('void f(void){ esp_ota_\\\rbegin(0,0,0); }\n')).c12[0]?.status, 'fail');
  });
  it('a CR-only splice after spaces inside a name fails C12', async () => {
    assert.equal((await c12('void f(void){ esp_ota_\\ \rbegin(0,0,0); }\n')).c12[0]?.status, 'fail');
  });
  it('a name after a CR-only line comment is still seen', async () => {
    assert.equal((await c12('// note\resp_ota_begin(0,0,0);\r')).c12[0]?.status, 'fail');
  });
  it('a name after a CRLF line comment is still seen', async () => {
    assert.equal((await c12('// note\r\nesp_ota_begin(0,0,0);\r\n')).c12[0]?.status, 'fail');
  });
  const oddLayouts: Array<[string, string]> = [
    ['Q2 a UTF-8 BOM before #include', '﻿#include "../evil.h"\nvoid f(void){}\n'],
    ['Q3 a form feed before #', '\f#include "../evil.h"\nvoid f(void){}\n'],
    ['Q4 a vertical tab after #', '#\vinclude "../evil.h"\nvoid f(void){}\n'],
    ['a form feed between # and include', '#\finclude "../evil.h"\nvoid f(void){}\n'],
    ['Q5 CR-only line endings, include on line 2', 'void a(void);\r#include "../evil.h"\rvoid f(void){}\r'],
    ['CRLF line endings', 'void a(void);\r\n#include "../evil.h"\r\nvoid f(void){}\r\n'],
    ['an include joined by a CR-only splice', '#inc\\\rlude "../evil.h"\nvoid f(void){}\n'],
  ];
  for (const [label, source] of oddLayouts) {
    it(`${label} warns that the target is not scanned`, async () => {
      const found = await c12(source);
      assert.equal(found.include.length, 1, JSON.stringify(found.include));
      assert.equal(found.include[0]?.level, 'warn');
    });
  }
  it('a BOM before an ordinary include gets no warning', async () => {
    assert.equal((await c12('﻿#include "inc.h"\nvoid f(void){}\n')).include.length, 0);
  });
});
