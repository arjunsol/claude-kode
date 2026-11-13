/** Build receipts: which image digests this server process produced itself.
 *
 * Files under a project's build directory can be written by anything, so their
 * presence is not evidence that a build ran. kode_build records the digest of
 * the image it produced; kode_inspect_image reports build-level evidence only
 * for an image whose digest has a receipt.
 *
 * Receipts live in memory for the life of the process. They are deliberately
 * not written to disk: a file the model's own shell could edit would prove
 * nothing. After a restart every image is unattested until it is built again.
 */
export class BuildReceipts {
  private readonly digests = new Map<string, string>();

  /** Record that this process built `projectName` and produced this image. */
  record(projectName: string, imageSha256: string): void {
    this.digests.set(projectName, imageSha256.toLowerCase());
  }

  /** True only when this process built exactly this image for this project. */
  observed(projectName: string, imageSha256: string): boolean {
    return this.digests.get(projectName) === imageSha256.toLowerCase();
  }
}
