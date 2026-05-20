import { readFileSync } from 'node:fs';

// Loader for the system prompt. Edit the prose in `apps/server/system-prompt.md`,
// not this file. The file is read once at module load; restart the server after
// editing the markdown to pick up changes.
export const SYSTEM_PROMPT = readFileSync(
  new URL('../system-prompt.md', import.meta.url),
  'utf8',
);
