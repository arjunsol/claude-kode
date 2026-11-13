/** Workflow 2, package fix-g2 (finding G2-1): sdkconfig.defaults is not read by imitating Kconfig. A
 * file the validator cannot read with certainty is refused whole, and the static rules read only
 * lines of one small grammar, where the validator and kconfgen agree (proved separately against
 * the real kconfgen; see the design record). Also G2-2: the line-break handling of the
 * idf_component.yml scans, and the byte rule for the files the gate lets through.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { newApp } from '../src/build/scaffold.js';
import { sdkconfigDefaultsProblem, validateProject, type ValidationOutcome } from '../src/build/validate.js';
import type { HostConfig } from '../src/build/workspace.js';
import { hostConfigFor, standInTemplate, tempDir, writeFiles } from './helpers.js';

const template = standInTemplate();
let ws: Awaited<ReturnType<typeof tempDir>>;
let tpl: Awaited<ReturnType<typeof tempDir>>;
let config: HostConfig;
let counter = 0;

before(async () => {
  ws = await tempDir('kode-wf2-defaults-ws-');
  tpl = await tempDir('kode-wf2-defaults-tpl-');
  await writeFiles(tpl.dir, template.files);
  config = hostConfigFor({ workspaceRoot: ws.dir, templateDir: tpl.dir });
});
after(async () => { await ws.close(); await tpl.close(); });

const STOCK = template.files['sdkconfig.defaults'] as string;
/** The first line after the stock file's own lines. */
const FIRST = STOCK.split('\n').length;
const FORMS = /Accepted lines/;

/** A project scaffolded from the stand-in template (so the build gate can find it eligible), then `overrides` written over it. */
async function scaffolded(overrides: Record<string, string | Buffer> = {}): Promise<{ name: string; dir: string }> {
  const name = `wf2_app_${counter++}`;
  await newApp(config, { projectName: name, displayName: 'Demo', categories: ['tools'] }, template.manifest);
  await writeFiles(join(ws.dir, name), overrides);
  return { name, dir: join(ws.dir, name) };
}
async function project(overrides: Record<string, string | Buffer>): Promise<ValidationOutcome> {
  return validateProject(config, (await scaffolded(overrides)).name, template.manifest);
}
const defaults = (content: string | Buffer) => project({ 'sdkconfig.defaults': content });
const failedRules = (outcome: ValidationOutcome) =>
  outcome.findings.filter(f => f.level === 'reject' && f.status === 'fail').map(f => f.rule);
const failedGate = (outcome: ValidationOutcome) =>
  outcome.buildLogic.findings.filter(f => f.level === 'reject' && f.status === 'fail');

describe('A. a line the validator cannot read with certainty makes the file, and the project, refused', () => {
  // [label, what follows the two stock lines, the line number the finding must name]
  const refused: Array<[string, string | Buffer, number]> = [
    // the shapes gate-2 found (X1 to X15)
    ['X1 a bool given as "no"', 'CONFIG_KODEOS_RADIO=no\n', FIRST],
    ['X2 an empty value', 'CONFIG_KODEOS_RADIO=\n', FIRST],
    ['X3 a space before =', 'CONFIG_ESP_HOSTED_ENABLED =n\n', FIRST],
    ['X4 two spaces in the unset form', '#  CONFIG_ESP_HOSTED_ENABLED  is not set\n', FIRST],
    ['X5 the deprecated-options block markers', '# Deprecated options for backward compatibility\nCONFIG_ESP_HOSTED_ENABLED=n\n# End of deprecated options\n', FIRST],
    ['X8 the "# default:" pragma', '# default:\nCONFIG_PARTITION_TABLE_CUSTOM_FILENAME="mine.csv"\n', FIRST],
    ['X9 a 0x1C before an assignment', '\x1cCONFIG_KODEOS_HOME_HOLD=n\n', FIRST],
    ['X10 U+2028 after a value', 'CONFIG_KODEOS_HOME_HOLD=n x\n', FIRST],
    ['X15 NEL before an assignment', '\u0085CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="mine.csv"\n', FIRST],
    // bytes, anywhere in the file, even inside a comment
    ['a lone CR in a comment', '# note\rCONFIG_KODEOS_HOME_HOLD=n\n', FIRST],
    ['a lone CR at the end of the file', '# note\r', FIRST],
    ['0x1D in a comment', '# a\x1db\n', FIRST],
    ['0x1E in a comment', '# a\x1eb\n', FIRST],
    ['0x1F in a comment', '# a\x1fb\n', FIRST],
    ['0x0B in a comment', '# a\x0bb\n', FIRST],
    ['0x0C in a comment', '# a\x0cb\n', FIRST],
    ['DEL in a comment', '# a\x7fb\n', FIRST],
    ['NUL in a comment', '# a\x00b\n', FIRST],
    ['a byte order mark in a comment', '# a﻿b\n', FIRST],
    ['a BOM at the very start of the file', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(STOCK)]), 1],
    ['a non-ASCII letter in a comment', '# café\n', FIRST],
    ['an astral character in a comment', '# \u{1F600}\n', FIRST],
    ['bytes that are not UTF-8', Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]), FIRST],
    // forms
    ['a bool given as "yes"', 'CONFIG_KODEOS_RADIO=yes\n', FIRST],
    ['a bool given as "Y"', 'CONFIG_KODEOS_RADIO=Y\n', FIRST],
    ['a bool given as the word true', 'CONFIG_KODEOS_RADIO=true\n', FIRST],
    ['an inline comment after y', 'CONFIG_KODEOS_HOME_HOLD=y # keep\n', FIRST],
    ['an inline comment after n', 'CONFIG_KODEOS_HOME_HOLD=n # off\n', FIRST],
    ['a tab and an inline comment', 'CONFIG_KODEOS_BOOT_ROLE_OS=y\t# os\n', FIRST],
    ['an inline comment after a string', 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="mine.csv" # mine\n', FIRST],
    ['trailing space after a value', 'CONFIG_KODEOS_RADIO=n \n', FIRST],
    ['a space after =', 'CONFIG_KODEOS_RADIO= n\n', FIRST],
    ['a leading space', ' CONFIG_KODEOS_HOME_HOLD=n\n', FIRST],
    ['a leading tab', '\tCONFIG_KODEOS_HOME_HOLD=n\n', FIRST],
    ['an indented unset line', '  # CONFIG_KODEOS_HOME_HOLD is not set\n', FIRST],
    ['a space-only line', '   \n', FIRST],
    ['a tab-only line', '\t\n', FIRST],
    ['a lower-case name', 'CONFIG_kodeos_radio=n\n', FIRST],
    ['a name with a dash', 'CONFIG_A-B=n\n', FIRST],
    ['an empty name', 'CONFIG_=n\n', FIRST],
    ['a missing =', 'CONFIG_KODEOS_RADIO\n', FIRST],
    ['a line that is no form at all', 'hello\n', FIRST],
    ['no CONFIG_ prefix', 'KODEOS_RADIO=n\n', FIRST],
    ['a second = in an unquoted value', 'CONFIG_A=1=2\n', FIRST],
    ['a leading zero decimal', 'CONFIG_A=007\n', FIRST],
    ['a plus sign', 'CONFIG_A=+1\n', FIRST],
    ['a float', 'CONFIG_A=1.5\n', FIRST],
    ['0x with no digits', 'CONFIG_A=0x\n', FIRST],
    ['a hex digit outside the range', 'CONFIG_A=0xZZ\n', FIRST],
    ['an unterminated string', 'CONFIG_A="abc\n', FIRST],
    ['a string with a backslash', 'CONFIG_A="a\\\\b"\n', FIRST],
    ['a string with an escaped quote', 'CONFIG_A="a\\"b"\n', FIRST],
    ['a string with an inner quote', 'CONFIG_A="a"b"\n', FIRST],
    ['a string with a tab', 'CONFIG_A="a\tb"\n', FIRST],
    ['text after a string', 'CONFIG_A="a" "b"\n', FIRST],
    ['a single-quoted string', "CONFIG_A='a'\n", FIRST],
    ['the unset form with trailing text', '# CONFIG_KODEOS_HOME_HOLD is not set (off)\n', FIRST],
    ['the unset form with trailing space', '# CONFIG_KODEOS_HOME_HOLD is not set \n', FIRST],
    ['the unset form with a tab', '# CONFIG_KODEOS_HOME_HOLD\tis not set\n', FIRST],
    ['the unset form with a lower-case name', '# CONFIG_kodeos_radio is not set\n', FIRST],
    ['the unset form without a space after #', '#CONFIG_KODEOS_HOME_HOLD is not set\n', FIRST],
    ['the pragma with a trailing space', '# default: \n', FIRST],
    ['the pragma without a space', '#default:\n', FIRST],
    ['the pragma in upper case', '# DEFAULT:\n', FIRST],
    ['the begin marker alone', '# Deprecated options for backward compatibility\n', FIRST],
    ['the end marker alone', '# End of deprecated options\n', FIRST],
    ['the end marker with a trailing space', '# End of deprecated options \n', FIRST],
    ['an assignment far down the file', '# one\n# two\nCONFIG_A=y\n# three\nCONFIG_B=maybe\n', FIRST + 4],
    ['a bad line in a file with CRLF line ends', '# one\r\nCONFIG_A=maybe\r\n', FIRST + 1],
    // A bool the rules read must be y or n, and the partition table must be a string. A bool given a number is
    // ignored by kconfgen (it keeps the earlier value) but would read as "not n" here, which hid B7 once.
    ['a tracked bool given 0 (the radio)', 'CONFIG_KODEOS_RADIO=0\n', FIRST],
    ['a tracked bool given 1 (esp-hosted)', 'CONFIG_ESP_HOSTED_ENABLED=1\n', FIRST],
    ['a tracked bool given a string (Bluetooth)', 'CONFIG_BT_ENABLED="n"\n', FIRST],
    ['a tracked bool given a hex number (HOME_HOLD)', 'CONFIG_KODEOS_HOME_HOLD=0x1\n', FIRST],
    ['a tracked bool given a number (AO_WATCH)', 'CONFIG_KQP_AO_WATCH=1\n', FIRST],
    ['a tracked bool given a number (the app role)', 'CONFIG_KODEOS_BOOT_ROLE_APP=1\n', FIRST],
    ['a tracked bool given a number (the OS role)', 'CONFIG_KODEOS_BOOT_ROLE_OS=0\n', FIRST],
    ['the bypass shape: radio n, then radio 0, with esp-hosted y', 'CONFIG_KODEOS_RADIO=n\nCONFIG_KODEOS_RADIO=0\nCONFIG_ESP_HOSTED_ENABLED=y\n', FIRST + 1],
    ['the partition table given y', 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME=y\n', FIRST],
    ['the partition table given a number', 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME=1\n', FIRST],
    ['the partition table in the unset form', '# CONFIG_PARTITION_TABLE_CUSTOM_FILENAME is not set\n', FIRST],
  ];
  for (const [label, tail, line] of refused) {
    it(`${label}: refused, naming line ${line}`, async () => {
      const content = typeof tail === 'string' ? STOCK + tail : (Buffer.isBuffer(tail) && tail.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? tail : Buffer.concat([Buffer.from(STOCK), tail]));
      const outcome = await defaults(content);
      assert.equal(outcome.buildLogic.eligible, false, 'the project must not be eligible to build');
      const gate = failedGate(outcome).find(f => f.rule === 'BL-DEFAULTS-GRAMMAR');
      assert.ok(gate, `expected BL-DEFAULTS-GRAMMAR, got ${failedGate(outcome).map(f => f.rule).join(',')}`);
      assert.ok(gate.message.includes(`line ${line}`), gate.message);
      assert.match(gate.message, FORMS);
      assert.equal(outcome.verdict, 'fail');
      assert.ok(failedRules(outcome).includes('CK-DEFAULTS-GRAMMAR'), failedRules(outcome).join(','));
      const verdictFinding = outcome.findings.find(f => f.rule === 'CK-DEFAULTS-GRAMMAR');
      assert.ok(verdictFinding?.message.includes(`line ${line}`), verdictFinding?.message);
    });
  }

  it('every rule that reads the file refuses to vouch for a file it could not read', async () => {
    const outcome = await defaults(`${STOCK}CONFIG_KODEOS_RADIO=no\n`);
    const failed = failedRules(outcome);
    for (const rule of ['B3', 'B4', 'B7', 'D8', 'C2-WATCH']) assert.ok(failed.includes(rule), `${rule} in ${failed.join(',')}`);
  });

  it('a project with a bad sdkconfig.defaults cannot be built: kode_build is told BUILD_LOGIC_NOT_PINNED by the gate', async () => {
    const outcome = await defaults(`${STOCK}CONFIG_KODEOS_RADIO=no\n`);
    assert.equal(outcome.buildLogic.eligible, false);
  });
});

describe('B. every line of the accepted grammar is read, and a project made only of them passes', () => {
  const accepted: Array<[string, string]> = [
    ['empty lines', '\n\n'],
    ['a plain comment', '# a note\n'],
    ['a comment with a tab and punctuation', '#\tnote: a=b, c # d\n'],
    ['a bare #', '#\n'],
    ['a commented-out assignment', '# CONFIG_KLOG_MAXIMUM_LEVEL_WARN=y\n'],
    ['a comment that mentions CONFIG_ without the unset form', '# CONFIG_FOO is the thing\n'],
    ['a comment that mentions "is not set" without CONFIG_', '# the radio is not set here\n'],
    ['a y assignment', 'CONFIG_FOO=y\n'],
    ['an n assignment', 'CONFIG_FOO=n\n'],
    ['a decimal', 'CONFIG_FOO=1024\n'],
    ['zero', 'CONFIG_FOO=0\n'],
    ['a negative decimal', 'CONFIG_FOO=-5\n'],
    ['a hex number', 'CONFIG_FOO=0x1F00\n'],
    ['a string', 'CONFIG_FOO="hello world"\n'],
    ['an empty string', 'CONFIG_FOO=""\n'],
    ['a string with # and = and spaces', 'CONFIG_FOO="a # b = c"\n'],
    ['a string that ends in =', 'CONFIG_FOO="a="\n'],
    ['the unset form', '# CONFIG_FOO is not set\n'],
    ['a name with digits', 'CONFIG_ESP32_P4_X=y\n'],
    ['no newline after the last line', 'CONFIG_FOO=y'],
    ['CRLF line ends', 'CONFIG_FOO=y\r\n# note\r\n\r\n'],
    ['a name that repeats', 'CONFIG_FOO=y\nCONFIG_FOO=n\n'],
  ];
  for (const [label, tail] of accepted) {
    it(`${label} is accepted: no grammar finding, eligible, verdict pass`, async () => {
      const outcome = await defaults(STOCK + tail);
      assert.deepEqual(failedRules(outcome), []);
      assert.deepEqual(failedGate(outcome), []);
      assert.equal(outcome.buildLogic.eligible, true);
      assert.equal(outcome.verdict, 'pass');
      assert.ok(outcome.findings.some(f => f.rule === 'CK-DEFAULTS-GRAMMAR' && f.status === 'pass'));
      assert.ok(outcome.buildLogic.findings.some(f => f.rule === 'BL-DEFAULTS-GRAMMAR' && f.status === 'pass'));
    });
  }

  it('the whole stock file in CRLF form is accepted', async () => {
    const outcome = await defaults(STOCK.replace(/\n/g, '\r\n'));
    assert.deepEqual(failedRules(outcome), []);
    assert.equal(outcome.buildLogic.eligible, true);
  });

  it('a missing sdkconfig.defaults is not a grammar failure (B4 still fails)', async () => {
    const { name, dir } = await scaffolded();
    await rm(join(dir, 'sdkconfig.defaults'));
    const outcome = await validateProject(config, name, template.manifest);
    assert.ok(!failedRules(outcome).includes('CK-DEFAULTS-GRAMMAR'), failedRules(outcome).join(','));
    assert.ok(failedRules(outcome).includes('B4'));
  });

  it('the last-value rules keep the last accepted line: B7 for radio n, hosted y then n', async () => {
    const outcome = await defaults(`${STOCK}CONFIG_KODEOS_RADIO=n\nCONFIG_ESP_HOSTED_ENABLED=y\nCONFIG_ESP_HOSTED_ENABLED=n\nCONFIG_BT_ENABLED=n\n`);
    assert.ok(!failedRules(outcome).includes('B7'), failedRules(outcome).join(','));
    const wrong = await defaults(`${STOCK}CONFIG_KODEOS_RADIO=n\nCONFIG_ESP_HOSTED_ENABLED=n\nCONFIG_ESP_HOSTED_ENABLED=y\nCONFIG_BT_ENABLED=n\n`);
    assert.ok(failedRules(wrong).includes('B7'));
  });

  it('B3 reads the last accepted partition table line', async () => {
    const outcome = await defaults('CONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_KODEOS_RADIO=n\nCONFIG_ESP_HOSTED_ENABLED=n\nCONFIG_BT_ENABLED=n\nCONFIG_PARTITION_TABLE_CUSTOM_FILENAME="mine.csv"\nCONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"\n');
    assert.deepEqual(failedRules(outcome), []);
    const wrong = await defaults('CONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"\nCONFIG_PARTITION_TABLE_CUSTOM_FILENAME="mine.csv"\n');
    assert.ok(failedRules(wrong).includes('B3'));
  });

  it('the every-assignment rules still judge every accepted assignment', async () => {
    assert.ok(failedRules(await defaults(`${STOCK}CONFIG_KODEOS_HOME_HOLD=n\nCONFIG_KODEOS_HOME_HOLD=y\n`)).includes('D8'));
    assert.ok(failedRules(await defaults(`${STOCK}# CONFIG_KQP_AO_WATCH is not set\nCONFIG_KQP_AO_WATCH=y\n`)).includes('C2-WATCH'));
    assert.ok(failedRules(await defaults(`${STOCK}CONFIG_KODEOS_BOOT_ROLE_OS=y\n`)).includes('B4'));
  });

  it('the grammar function agrees: accepted forms give no problem, a refused one names its line', () => {
    const terminated = accepted.map(([, text]) => (text.endsWith('\n') ? text : `${text}\n`));
    assert.equal(sdkconfigDefaultsProblem(STOCK + terminated.join('')), undefined);
    const problem = sdkconfigDefaultsProblem(`${STOCK}CONFIG_A=maybe\n`);
    assert.equal(problem?.line, FIRST);
    assert.equal(sdkconfigDefaultsProblem(''), undefined);
  });

  const realTemplate = process.env.KODE_TEST_TEMPLATE_DIR;
  it('the pinned official template sdkconfig.defaults is inside the grammar (KODE_TEST_TEMPLATE_DIR)', (t) => {
    if (!realTemplate) { t.skip('set KODE_TEST_TEMPLATE_DIR to the official template to run this'); return; }
    const text = readFileSync(join(realTemplate, 'sdkconfig.defaults'), 'utf8');
    assert.equal(sdkconfigDefaultsProblem(text), undefined);
  });
});

describe('C. the byte rule covers the other configuration files the rules read', () => {
  it('a root sdkconfig with a 0x1C line is not accepted by BL-SDKCONFIG', async () => {
    const good = 'CONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_IDF_TARGET="esp32p4"\n';
    const ok = await project({ 'sdkconfig': good });
    assert.ok(!failedGate(ok).some(f => f.rule === 'BL-SDKCONFIG'), JSON.stringify(failedGate(ok)));
    const bad = await project({ 'sdkconfig': `${good}\x1cCONFIG_KODEOS_BOOT_ROLE_APP=n\n` });
    assert.ok(failedGate(bad).some(f => f.rule === 'BL-SDKCONFIG'), JSON.stringify(failedGate(bad)));
  });

  it('a root sdkconfig with the role inside a deprecated-options block is refused', async () => {
    const outcome = await project({ 'sdkconfig': '# Deprecated options for backward compatibility\nCONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_IDF_TARGET="esp32p4"\n# End of deprecated options\n' });
    assert.ok(failedGate(outcome).some(f => f.rule === 'BL-SDKCONFIG'), JSON.stringify(failedGate(outcome)));
  });

  const stockYml = template.files['main/idf_component.yml'] as string;
  it('main/idf_component.yml with a byte outside printable ASCII, LF, CRLF and tab fails CK-MANIFEST-BYTES, naming the line', async () => {
    for (const bytes of ['# café\n', '# a\x1cb\n', '# a﻿b\n', '# note\r# more\n']) {
      const outcome = await project({ 'main/idf_component.yml': `${stockYml}${bytes}` });
      const finding = outcome.findings.find(f => f.rule === 'CK-MANIFEST-BYTES');
      assert.equal(finding?.status, 'fail', JSON.stringify(bytes));
      assert.ok(finding.message.includes('line 7'), finding.message);
      assert.equal(outcome.verdict, 'fail');
    }
    const clean = await project({ 'main/idf_component.yml': stockYml.replace(/\n/g, '\r\n') });
    assert.equal(clean.findings.find(f => f.rule === 'CK-MANIFEST-BYTES')?.status, 'pass');
    assert.equal(clean.verdict, 'pass');
  });
});

describe('D. G2-2: a lone CR is a line break for the idf_component.yml scans', () => {
  const stockYml = template.files['main/idf_component.yml'] as string;
  const b1 = (outcome: ValidationOutcome) => outcome.findings.find(f => f.rule === 'B1');

  it('control: the stock manifest passes B1', async () => {
    assert.equal(b1(await project({ 'main/idf_component.yml': stockYml }))?.status, 'pass');
  });

  it('M2 an override_path after a comment and a lone CR fails B1 itself', async () => {
    const outcome = await project({ 'main/idf_component.yml': `${stockYml}# note\r    override_path: "../../elsewhere"\n` });
    assert.equal(b1(outcome)?.status, 'fail');
  });

  // Outside any dependency block parseDependencies never sees the key, so only the override_path scan can refuse it.
  it('M2 a top-level override_path after a comment and a lone CR fails B1 through the override_path scan', async () => {
    const outcome = await project({ 'main/idf_component.yml': `${stockYml}# note\roverride_path: "../../elsewhere"\n` });
    assert.equal(b1(outcome)?.status, 'fail');
  });

  it('M2 an override_path in another top-level key, after an inline comment and a lone CR, fails B1 through the override_path scan', async () => {
    const outcome = await project({ 'main/idf_component.yml': `${stockYml}other: 1 # note\roverride_path: "../../elsewhere"\n` });
    assert.equal(b1(outcome)?.status, 'fail');
  });

  it('M2 an override_path after a comment and a lone CR, in the middle of a file', async () => {
    const outcome = await project({ 'main/idf_component.yml': stockYml.replace('    path:', '    # note\r    override_path: "../../elsewhere"\n    path:') });
    assert.equal(b1(outcome)?.status, 'fail');
  });

  it('M3 a second git key after an inline comment and a lone CR fails B1 itself', async () => {
    const outcome = await project({ 'main/idf_component.yml': stockYml.replace('    version: v0.1.0\n', '    version: v0.1.0 # x\r    git: https://example.com/other-sdk.git\n') });
    assert.equal(b1(outcome)?.status, 'fail');
  });

  it('M3 a second path key after a comment and a lone CR fails B1 itself', async () => {
    const outcome = await project({ 'main/idf_component.yml': stockYml.replace('    version: v0.1.0\n', '    version: v0.1.0 # x\r    path: ../elsewhere\n') });
    assert.equal(b1(outcome)?.status, 'fail');
  });
});
