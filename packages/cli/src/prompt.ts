import { createInterface } from 'node:readline/promises';

import { CliError } from './errors.js';
import { color, note } from './output.js';

/**
 * Asking a question, for the two commands that have one to ask.
 *
 * A numbered list rather than an arrow-key menu: a menu means raw mode, redraw
 * and cursor handling, and the payoff is a nicer version of a thing the user
 * does twice. Every prompt here also has a flag that skips it, so a script never
 * reaches this file.
 */

const requireTty = (question: string): void => {
  if (!process.stdin.isTTY) {
    throw new CliError(
      `Cannot ask "${question}" — this is not an interactive terminal`,
      {
        hint: 'Pass the value as a flag instead.'
      }
    );
  }
};

export const ask = async (
  question: string,
  fallback?: string
): Promise<string> => {
  requireTty(question);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const suffix = fallback ? color.gray(` (${fallback})`) : '';
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer || fallback || '';
  } finally {
    rl.close();
  }
};

export interface Choice<T> {
  label: string;
  detail?: string;
  value: T;
}

export const select = async <T>(
  question: string,
  choices: Choice<T>[]
): Promise<T> => {
  if (choices.length === 0) {
    throw new CliError(`Nothing to choose for "${question}"`);
  }
  // One option is not a question. Answering it for the user is not a shortcut,
  // it is the correct answer.
  if (choices.length === 1) return choices[0].value;

  requireTty(question);
  note(`${color.bold(question)}`);
  choices.forEach((choice, index) => {
    const detail = choice.detail ? ` ${color.gray(choice.detail)}` : '';
    note(`  ${color.cyan(String(index + 1))}. ${choice.label}${detail}`);
  });

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      const answer = (await rl.question('  # ')).trim();
      const index = Number.parseInt(answer, 10);
      if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
        return choices[index - 1].value;
      }
      note(color.yellow(`  enter a number between 1 and ${choices.length}`));
    }
  } finally {
    rl.close();
  }
};

export const confirm = async (question: string): Promise<boolean> => {
  requireTty(question);
  const answer = await ask(`${question} [y/N]`);
  return /^y(es)?$/i.test(answer.trim());
};
