declare module 'node:fs' {
 export function readFileSync(path: string, encoding: 'utf8'): string;
 export function mkdirSync(path: string, options: { recursive: boolean }): unknown;
 export function writeFileSync(path: string, data: string): void;
}
