import fs from "node:fs";
import path from "node:path";
import { FbpError } from "./errors";

type ValueType = "texte" | "nombre" | "booleen" | "inconnu";
type Statement =
  | { kind: "assign"; name: string; value: string; line: number }
  | { kind: "function"; name: string; body: Statement[]; line: number }
  | { kind: "call"; name: string; args: string[]; line: number }
  | { kind: "import"; names: string[]; source: string; line: number };

export interface RunOptions {
  onOutput?: (value: unknown) => void;
  nativeFunctions?: Record<string, (...args: unknown[]) => unknown>;
}

function valueType(value: string): ValueType {
  const v = value.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(v) || /^'(?:[^'\\]|\\.)*'$/.test(v)) return "texte";
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return "nombre";
  if (v === "true" || v === "false") return "booleen";
  return "inconnu";
}

function splitArguments(raw: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote = "";
  let depth = 0;
  for (const char of raw) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function parseFile(file: string, source: string): Statement[] {
  const lines = source.split(/\r?\n/);
  const root: Statement[] = [];
  const stack: Array<{ name: string; line: number; body: Statement[] }> = [];
  const target = () => stack.length ? stack[stack.length - 1].body : root;

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.trim();
    const lineNo = index + 1;
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    const importMatch = line.match(/^import\s*\{\s*([^}]+)\s*\}\s*de\s*(["'])(.+?)\2\s*$/);
    if (importMatch) {
      target().push({ kind: "import", names: importMatch[1].split(",").map(x => x.trim()), source: importMatch[3], line: lineNo });
      continue;
    }

    const functionMatch = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(\s*\)\s*\{$/u);
    if (functionMatch) {
      const entry = { name: functionMatch[1], line: lineNo, body: [] as Statement[] };
      target().push({ kind: "function", ...entry });
      stack.push(entry);
      continue;
    }

    if (line === "}") {
      if (!stack.length) throw new FbpError("Accolade fermante sans fonction correspondante.", file, lineNo);
      stack.pop();
      continue;
    }

    const assignment = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+)$/u);
    if (assignment) {
      target().push({ kind: "assign", name: assignment[1], value: assignment[2].trim(), line: lineNo });
      continue;
    }

    const call = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)\s*;?$/u);
    if (call) {
      target().push({ kind: "call", name: call[1], args: splitArguments(call[2]), line: lineNo });
      continue;
    }

    throw new FbpError(`Syntaxe non reconnue : « ${line} ». Vérifie les parenthèses, les accolades et le signe =.`, file, lineNo);
  }

  if (stack.length) {
    const open = stack[stack.length - 1];
    throw new FbpError(`La fonction « ${open.name} » n'est pas fermée par }.`, file, open.line);
  }
  return root;
}

export class FbpCompiler {
  private variables = new Map<string, { type: ValueType; value: unknown }>();
  private functions = new Map<string, Statement & { kind: "function" }>();
  private imports = new Map<string, string>();
  private output: (value: unknown) => void;
  private nativeFunctions: Record<string, (...args: unknown[]) => unknown>;
  private baseDir = process.cwd();

  constructor(options: RunOptions = {}) {
    this.output = options.onOutput ?? (value => console.log(value));
    this.nativeFunctions = options.nativeFunctions ?? {};
  }

  runFile(filePath: string): void {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute)) throw new FbpError(`Fichier introuvable : ${absolute}`);
    if (!fs.statSync(absolute).isFile()) throw new FbpError(`Le chemin indiqué n'est pas un fichier : ${absolute}`);
    this.baseDir = path.dirname(absolute);
    this.execute(parseFile(absolute, fs.readFileSync(absolute, "utf8")), this.baseDir);
  }

  runFunction(name: string): void {
    const fn = this.functions.get(name);
    if (!fn) throw new FbpError(`Fonction « ${name} » inconnue.`);
    this.execute(fn.body, this.imports.has(name) ? path.dirname(this.imports.get(name)!) : this.baseDir);
  }

  private execute(statements: Statement[], baseDir: string): void {
    for (const statement of statements) {
      if (statement.kind === "import") {
        const targetFile = path.resolve(baseDir, statement.source);
        if (!fs.existsSync(targetFile)) throw new FbpError(`Fichier importé introuvable : ${statement.source}`);
        const nested = parseFile(targetFile, fs.readFileSync(targetFile, "utf8"));
        for (const item of nested) {
          if (item.kind === "function") this.functions.set(item.name, item);
        }
        for (const name of statement.names) {
          if (!this.functions.has(name)) throw new FbpError(`La fonction « ${name} » n'existe pas dans ${statement.source}.`);
          this.imports.set(name, targetFile);
        }
      } else if (statement.kind === "function") {
        if (this.functions.has(statement.name)) throw new FbpError(`La fonction « ${statement.name} » est définie plusieurs fois.`, undefined, statement.line);
        this.functions.set(statement.name, statement);
      } else if (statement.kind === "assign") {
        const type = valueType(statement.value);
        const previous = this.variables.get(statement.name);
        if (previous && type !== "inconnu" && previous.type !== "inconnu" && previous.type !== type) {
          throw new FbpError(`Type incompatible pour « ${statement.name} » : attendu ${previous.type}, reçu ${type}.`, undefined, statement.line);
        }
        const value = this.evaluate(statement.value, statement.line);
        this.variables.set(statement.name, { type: previous?.type ?? type, value });
      } else {
        this.call(statement.name, statement.args, statement.line, baseDir);
      }
    }
  }

  private evaluate(expression: string, line: number): unknown {
    const value = expression.trim();
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\(["'\\])/g, "$1");
    }
    if (this.variables.has(value)) return this.variables.get(value)!.value;
    throw new FbpError(`Valeur inconnue « ${value} ». Utilise un texte, un nombre, true, false ou une variable déclarée.`, undefined, line);
  }

  private call(name: string, args: string[], line: number, baseDir: string): void {
    const values = args.map(arg => this.evaluate(arg, line));
    if (name === "affiche") {
      this.output(values.map(value => value === undefined ? "" : String(value)).join(" "));
      return;
    }
    if (name === "ping") {
      this.output("FBP fonctionne. Cette commande ne vérifie pas à elle seule une connexion Discord.");
      return;
    }
    const nativeFunction = this.nativeFunctions[name];
    if (nativeFunction) {
      nativeFunction(...values);
      return;
    }
    const fn = this.functions.get(name);
    if (!fn) throw new FbpError(`Fonction « ${name} » inconnue. Vérifie son nom ou son import.`, undefined, line);
    this.execute(fn.body, this.imports.has(name) ? path.dirname(this.imports.get(name)!) : baseDir);
  }
}
