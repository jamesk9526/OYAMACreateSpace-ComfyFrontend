import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LogEntry, LogLevel } from '../../shared/logs';

export function redactLog(message: string): string {
  return message
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(
      /\b(authorization|api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .replace(/([?&](?:token|key|password|secret)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '[preview media]')
    .slice(0, 8000);
}
export class AppLogger {
  private entries: LogEntry[] = [];
  readonly filename: string;
  private bytes = 0;
  constructor(root: string) {
    const dir = path.join(root, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    this.filename = path.join(dir, 'app.jsonl');
    for (const file of [this.filename + '.1', this.filename]) {
      if (!fs.existsSync(file)) continue;
      const size = fs.statSync(file).size;
      if (size > 2 * 1024 * 1024) continue;
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        try {
          const entry = JSON.parse(line) as LogEntry;
          if (
            typeof entry.message === 'string' &&
            typeof entry.time === 'string' &&
            ['info', 'warn', 'error'].includes(entry.level)
          )
            this.entries.push(entry);
        } catch {
          /* An interrupted final write is not a log entry. */
        }
      }
    }
    this.entries = this.entries.slice(-1000);
    this.bytes = fs.existsSync(this.filename) ? fs.statSync(this.filename).size : 0;
  }
  write(level: LogLevel, source: string, message: string) {
    const entry: LogEntry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      level,
      source: source.slice(0, 100),
      message: redactLog(message),
    };
    this.entries.push(entry);
    if (this.entries.length > 1000) this.entries.shift();
    try {
      const line = JSON.stringify(entry) + '\n';
      if (this.bytes + Buffer.byteLength(line) > 1024 * 1024) {
        fs.rmSync(this.filename + '.1', { force: true });
        if (fs.existsSync(this.filename)) fs.renameSync(this.filename, this.filename + '.1');
        this.bytes = 0;
      }
      fs.appendFileSync(this.filename, line, 'utf8');
      this.bytes += Buffer.byteLength(line);
    } catch {
      /* Keep diagnostics in memory when disk writes fail. */
    }
  }
  snapshot() {
    return this.entries.map((entry) => ({ ...entry }));
  }
}
