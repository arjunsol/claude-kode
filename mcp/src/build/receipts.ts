/** Build receipts: which build outputs this server process produced itself.
 *
 * Files under a project's build directory can be written by anything, so their
 * presence is not evidence that a build ran. kode_build records SHA-256 digests
 * of what it produced; kode_inspect_image reports build-level evidence only for
 * an inspection whose digests all match a receipt.
 *
 * A receipt covers the image and the two build metadata files the inspection
 * judges from (build/config/sdkconfig.json and build/flasher_args.json). A
 * metadata file that is absent is recorded as absent (null) and matches only
 * another absent file, never a present one.
 *
 * Receipts live in memory for the life of the process. They are deliberately
 * not written to disk: a file the model's own shell could edit would prove
 * nothing. After a restart every image is unattested until it is built again.
 */
export type BuildDigests = {
  /** SHA-256 of build/<name>.bin. */
  image: string;
  /** SHA-256 of build/config/sdkconfig.json, or null when the file is absent. */
  sdkconfigJson: string | null;
  /** SHA-256 of build/flasher_args.json, or null when the file is absent. */
  flasherArgs: string | null;
};

const normal = (digest: string | null): string | null => digest === null ? null : digest.toLowerCase();
const same = (a: string | null, b: string | null): boolean => normal(a) === normal(b);

export class BuildReceipts {
  private readonly digests = new Map<string, BuildDigests>();

  /** Record that this process built `projectName` and produced these outputs. */
  record(projectName: string, digests: BuildDigests): void {
    this.digests.set(projectName, {
      image: digests.image.toLowerCase(), sdkconfigJson: normal(digests.sdkconfigJson), flasherArgs: normal(digests.flasherArgs),
    });
  }

  /** True only when this process built exactly these outputs for this project:
   * all three digests must match. */
  observed(projectName: string, digests: BuildDigests): boolean {
    const receipt = this.digests.get(projectName);
    return receipt !== undefined && same(receipt.image, digests.image) &&
      same(receipt.sdkconfigJson, digests.sdkconfigJson) && same(receipt.flasherArgs, digests.flasherArgs);
  }
}
