import path from "node:path";

export class FbpError extends Error {
  constructor(message: string, public readonly file?: string, public readonly line?: number) {
    super(message);
    this.name = "FbpError";
  }

  format(): string {
    const location = this.file
      ? `${path.relative(process.cwd(), this.file)}${this.line ? `:${this.line}` : ""}: `
      : "";
    return `Erreur FBP : ${location}${this.message}`;
  }
}
