import { lintTools } from '@ganju/utils/toolLint';
import type { ToolLintFinding } from '@ganju/utils/toolLint';

import { buildManifest } from './project.js';
import type { ProjectFile, ProjectTool } from './project.js';
import { color, note, warn } from './output.js';

/**
 * The linter's findings for the tools in `ganju.json`, on their own.
 *
 * Only what the file can show: the server's other tools — natives, HTTP
 * endpoints, proxied servers — live in the dashboard, so overlap with them and
 * the server-wide count come from the API when `ganju deploy` creates the
 * version.
 */
export const lintProjectTools = (tools: ProjectTool[]): ToolLintFinding[] =>
  lintTools(buildManifest(tools).tools);

/** Print findings as warnings, one per line, grouped under a count. */
export const printLintFindings = (findings: ToolLintFinding[]): void => {
  if (findings.length === 0) return;
  warn(
    `${findings.length} ${findings.length === 1 ? 'warning' : 'warnings'} about how your tools read to a model`
  );
  for (const finding of findings) {
    note(
      `  ${color.yellow('·')} ${finding.message} ${color.gray(`[${finding.rule}]`)}`
    );
  }
};

/**
 * Empty `allowedHosts` lets functions reach any public host. Not part of
 * `--strict`: there's no value that means "none", so a project whose
 * functions call nothing outside couldn't make it pass.
 */
export const warnOpenEgress = (file: ProjectFile): void => {
  if (file.allowedHosts?.length) return;
  warn(
    'allowedHosts is empty, so your functions can call any public host. List the hosts they call in ganju.json.'
  );
};
