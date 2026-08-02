export class DuplicateCodexAccountError extends Error {
  constructor(
    readonly duplicateAccountId: number,
    readonly existingAccountId: number,
    email: string,
  ) {
    super(`${email} is already added to Orchestrator.`);
    this.name = "DuplicateCodexAccountError";
  }
}
