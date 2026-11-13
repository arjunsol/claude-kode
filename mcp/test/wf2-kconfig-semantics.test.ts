/** Workflow 2, package fix-g3 (finding N-1): accepted sdkconfig.defaults lines may not reach the protected
 * partition table or radio state through Kconfig semantics the validator does not read. Two shapes, both
 * proved against the real kconfgen by the gate: another member of the partition-table choice, and a radio
 * that is not assigned (so it takes its Kconfig default while esp-hosted is turned on).
 * Fixed by a narrower accepted set and a wider refusal, never by imitating Kconfig.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { newApp } from '../src/build/scaffold.js';
import { validateProject, type ValidationOutcome } from '../src/build/validate.js';
import type { HostConfig } from '../src/build/workspace.js';
import { hostConfigFor, standInTemplate, tempDir, writeFiles } from './helpers.js';

const template = standInTemplate();
let ws: Awaited<ReturnType<typeof tempDir>>;
let tpl: Awaited<ReturnType<typeof tempDir>>;
let config: HostConfig;
let counter = 0;

before(async () => {
  ws = await tempDir('kode-wf2-kc-ws-');
  tpl = await tempDir('kode-wf2-kc-tpl-');
  await writeFiles(tpl.dir, template.files);
  config = hostConfigFor({ workspaceRoot: ws.dir, templateDir: tpl.dir });
});
after(async () => { await ws.close(); await tpl.close(); });

const STOCK = template.files['sdkconfig.defaults'] as string;
const TABLE = 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"\n';

async function defaults(content: string): Promise<ValidationOutcome> {
  const name = `wf2_kc_${counter++}`;
  await newApp(config, { projectName: name, displayName: 'Demo', categories: ['tools'] }, template.manifest);
  await writeFiles(join(ws.dir, name), { 'sdkconfig.defaults': content });
  return validateProject(config, name, template.manifest);
}
const failedRules = (outcome: ValidationOutcome) =>
  outcome.findings.filter(f => f.level === 'reject' && f.status === 'fail').map(f => f.rule);

describe('N-1 the partition table is not reachable through another member of its choice', () => {
  const others = [
    ['R1 TWO_OTA', 'CONFIG_PARTITION_TABLE_TWO_OTA=y\n'],
    ['R2 SINGLE_APP_LARGE', 'CONFIG_PARTITION_TABLE_SINGLE_APP_LARGE=y\n'],
    ['SINGLE_APP given n', 'CONFIG_PARTITION_TABLE_SINGLE_APP=n\n'],
    ['the unset form of a member', '# CONFIG_PARTITION_TABLE_TWO_OTA is not set\n'],
    ['the custom member itself', 'CONFIG_PARTITION_TABLE_CUSTOM=y\n'],
    ['the table offset', 'CONFIG_PARTITION_TABLE_OFFSET=0x10000\n'],
  ];
  for (const [label, line] of others) {
    it(`${label} is refused by B3, and the project is not eligible`, async () => {
      const outcome = await defaults(STOCK + line);
      assert.ok(failedRules(outcome).includes('B3'), `B3 in [${failedRules(outcome).join(',')}]`);
      assert.equal(outcome.verdict, 'fail');
    });
  }

  it('a symbol that merely shares a longer prefix is not mistaken for the table family (control)', async () => {
    const outcome = await defaults(`${STOCK}CONFIG_PARTITION_TABLEX=y\n`);
    assert.ok(!failedRules(outcome).includes('B3'), failedRules(outcome).join(','));
  });

  it('the stock partition table line alone still passes (control)', async () => {
    const outcome = await defaults(STOCK);
    assert.deepEqual(failedRules(outcome), []);
    assert.equal(outcome.verdict, 'pass');
  });
});

describe('N-1 an unassigned radio is off for the app role, so B7 applies to it', () => {
  const noRadio = (extra: string) => `${TABLE}CONFIG_KODEOS_BOOT_ROLE_APP=y\n${extra}`;

  it('Q1 radio line deleted and esp-hosted set y is refused by B7', async () => {
    const outcome = await defaults(noRadio('CONFIG_ESP_HOSTED_ENABLED=y\nCONFIG_BT_ENABLED=n\n'));
    assert.ok(failedRules(outcome).includes('B7'), `B7 in [${failedRules(outcome).join(',')}]`);
    assert.equal(outcome.verdict, 'fail');
  });

  it('radio line deleted and Bluetooth set y is refused by B7', async () => {
    const outcome = await defaults(noRadio('CONFIG_ESP_HOSTED_ENABLED=n\nCONFIG_BT_ENABLED=y\n'));
    assert.ok(failedRules(outcome).includes('B7'), failedRules(outcome).join(','));
  });

  it('radio line deleted and nothing said about esp-hosted is refused by B7 (its default is not read here)', async () => {
    const outcome = await defaults(noRadio(''));
    assert.ok(failedRules(outcome).includes('B7'), failedRules(outcome).join(','));
  });

  it('radio line deleted with esp-hosted and Bluetooth n still passes (control)', async () => {
    const outcome = await defaults(noRadio('CONFIG_ESP_HOSTED_ENABLED=n\nCONFIG_BT_ENABLED=n\n'));
    assert.deepEqual(failedRules(outcome), []);
  });

  it('Q2 radio n kept and esp-hosted y is still refused (control)', async () => {
    const outcome = await defaults(noRadio('CONFIG_KODEOS_RADIO=n\nCONFIG_ESP_HOSTED_ENABLED=y\nCONFIG_BT_ENABLED=n\n'));
    assert.ok(failedRules(outcome).includes('B7'));
  });

  it('a radio turned on (last value y) needs nothing (control)', async () => {
    const outcome = await defaults(noRadio('CONFIG_KODEOS_RADIO=y\n'));
    assert.ok(!failedRules(outcome).includes('B7'), failedRules(outcome).join(','));
  });
});
