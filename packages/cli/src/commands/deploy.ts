import { bundleProject } from '../bundle.js';
import { commandContext, describeTarget } from '../context.js';
import { printLintFindings } from '../lint.js';
import { CliError } from '../errors.js';
import { appLive } from '../guard.js';
import type { GuardVersion } from '../guard.js';
import { color, formatBytes, note, step, success, warn } from '../output.js';
import { confirm } from '../prompt.js';
import { DataApi } from '../data/routes.js';
import { collectSource, encodeSnapshot } from '../source.js';
import {
  buildConfig,
  buildManifest,
  readTools,
  readTriggers
} from '../project.js';

import type { ApiClient } from '../api.js';
import type { LoadedProject } from '../project.js';
import * as constants from '@ganju/utils/cliConstants';
import type { ToolLintFinding } from '@ganju/utils/toolLint';

interface VersionRow {
  id: string;
  version: number;
  status: string;
  // The linter's findings, run by the API against the whole server — so they
  // include overlap with tools this project can't see. Absent from an API
  // older than the linter.
  warnings?: ToolLintFinding[];
}

/**
 * `ganju deploy` — build the project, upload it, and make it live.
 *
 * Three requests, in the order the API requires: the manifest and config create
 * a draft, the bundle attaches to that draft, and publish deploys the script and
 * moves the artifact's active version. They are separate on the server because a
 * manifest is JSON and a bundle is bytes, and because a failed upload should
 * leave a visible draft rather than nothing.
 *
 * Which means a deploy that dies partway leaves a draft behind. That is the
 * intended state and not a leak — `ganju versions` shows it, and the next deploy
 * makes a new one rather than resuming it, because a draft whose bundle never
 * arrived is not a thing to publish.
 */
export const deploy = async (flags: {
  draft?: boolean;
  minify?: boolean;
  force?: boolean;
}): Promise<void> => {
  const { project, target, api, artifactPath } = await commandContext();
  const tools = readTools(project);

  // A draft replaces nothing, so only a publish is checked.
  if (!flags.draft && !flags.force) {
    await guardAppChanges(
      api,
      artifactPath,
      tools.map(tool => tool.name)
    );
  }

  step(`bundling ${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`);
  const bundle = await bundleProject(project, tools, {
    minify: flags.minify ?? true
  });

  const saving =
    bundle.rawBytes > bundle.bytes
      ? ` ${color.gray(`(from ${formatBytes(bundle.rawBytes)})`)}`
      : '';
  note(
    color.gray(
      `  ${formatBytes(bundle.bytes)}${saving} · ${bundle.entryDescription}`
    )
  );

  step('creating a draft version');
  const config = buildConfig(project.file);
  const version = await api.request<VersionRow>(
    `${artifactPath}/custom-code/version`,
    {
      method: 'POST',
      json: {
        manifest: buildManifest(tools),
        // Sent with the code, because these say how the code is allowed to run —
        // the same review, the same request. `activeVersionId` is never among
        // them: only publish and rollback move that.
        ...(config ? { config } : {})
      }
    }
  );

  printLintFindings(version.warnings ?? []);

  step(`uploading v${version.version}`);
  await api.request(
    `${artifactPath}/custom-code/version/${version.id}/bundle`,
    {
      method: 'PUT',
      // No `?kind` — the upload defaults to `bundle`, which is what this is. The
      // dashboard's editor shows a bundle read-only rather than inviting someone
      // to overwrite a real build with the contents of a text box.
      headers: {
        'content-type': 'application/javascript',
        'content-length': String(Buffer.byteLength(bundle.code, 'utf8'))
      },
      body: bundle.code
    }
  );

  if (project.file.uploadSource !== false) {
    await uploadSource(project, api, artifactPath, version.id);
  }

  if (flags.draft) {
    success(`saved v${version.version} as a draft — nothing is live yet`);
    note(
      color.gray(
        `  publish it with \`ganju deploy\`, or try it with \`ganju test <tool>\``
      )
    );
    return;
  }

  step('publishing');
  await api.request(
    `${artifactPath}/custom-code/version/${version.id}/publish`,
    {
      method: 'POST'
    }
  );

  success(
    `v${version.version} is live on ${color.bold(describeTarget(target))} — ${
      tools.length
    } ${tools.length === 1 ? 'tool' : 'tools'}`
  );
  for (const tool of tools) {
    note(
      color.gray(
        `  ${tool.name}${tool.expose === false ? ' (triggers only)' : ''}${
          tool.channels === true ? ' (messages through channels)' : ''
        }`
      )
    );
  }

  // After the publish, so a trigger can name a function this deploy added.
  const triggers = readTriggers(project);
  if (triggers === null) return;
  step(
    `deploying ${triggers.length} ${triggers.length === 1 ? 'trigger' : 'triggers'}`
  );
  const result = await new DataApi(api, `${artifactPath}/data`).request<{
    triggers: {
      name: string;
      table: string;
      on: string;
      after?: { column: string; minutes: number } | null;
    }[];
    removed: string[];
    secrets: Record<string, string>;
    confirming?: string[];
  }>('deployTriggers', { json: { triggers } });
  for (const trigger of result.triggers) {
    // A time trigger: "30 min after created_at", or before a date.
    const after = trigger.after
      ? ` (${Math.abs(trigger.after.minutes)} min ${trigger.after.minutes < 0 ? 'before' : 'after'} ${trigger.after.column})`
      : '';
    note(
      color.gray(`  ${trigger.name}: ${trigger.table} ${trigger.on}${after}`)
    );
  }
  for (const name of result.removed) note(color.gray(`  removed ${name}`));
  for (const [name, secret] of Object.entries(result.secrets)) {
    // Shown once, like a token: the receiver checks signatures with it.
    success(`${name}'s webhook signing secret (shown once): ${secret}`);
  }
  if (result.confirming?.length) {
    note(
      `${result.confirming.join(', ')} must confirm before email triggers write to them; Ganju sends each a link once.`
    );
  }
};

/**
 * Stop before replacing code made in the app, unless the author says to
 * go ahead. In a script (no terminal to ask in) it takes --force.
 */
const guardAppChanges = async (
  api: ApiClient,
  artifactPath: string,
  nextTools: string[]
): Promise<void> => {
  const list = await api.request<{
    activeVersionId: string | null;
    versions: GuardVersion[];
  }>(`${artifactPath}/custom-code/versions`);
  const live = appLive(list, nextTools);
  if (!live) return;

  warn(
    `The live version, v${live.version}, was made in the app. Deploying replaces it with this folder's code.`
  );
  if (live.lost.length) {
    note(
      `  These functions would stop working: ${live.lost.map(name => color.bold(name)).join(', ')}`
    );
  }
  note(
    color.gray(
      '  Copy any changes made in the app that you want to keep into this project first.'
    )
  );

  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new CliError('Stopped — nothing was deployed', {
      hint: 'Run `ganju deploy --force` to replace it anyway.'
    });
  }
  if (!(await confirm('Replace it?'))) {
    throw new CliError('Stopped — nothing was deployed', { exitCode: 1 });
  }
};

/**
 * Upload the project's readable source beside the bundle. Never fails the
 * deploy: the bundle is what runs, the source is only shown.
 */
const uploadSource = async (
  project: LoadedProject,
  api: ApiClient,
  artifactPath: string,
  versionId: string
): Promise<void> => {
  try {
    const source = await collectSource(project.root);
    if (source.tooBig) {
      warn(
        `Not uploading the source: ${source.tooBig.files} files, ${formatBytes(source.tooBig.bytes)} (the limit is ${formatBytes(constants.CUSTOM_CODE_MAX_SNAPSHOT_BYTES)}).`
      );
      note(
        color.gray(
          '  Ignore build output in .gitignore, or set "uploadSource": false in ganju.json.'
        )
      );
      return;
    }
    const count = Object.keys(source.files).length;
    if (count === 0) return;

    step(
      `uploading the source (${count} ${count === 1 ? 'file' : 'files'}, ${formatBytes(source.bytes)})`
    );
    const large = source.skipped.filter(entry => entry.reason === 'large');
    if (large.length) {
      note(
        color.gray(
          `  left out, over ${formatBytes(constants.CUSTOM_CODE_MAX_SNAPSHOT_FILE_BYTES)} each: ${large.map(entry => entry.path).join(', ')}`
        )
      );
    }
    const body = encodeSnapshot(source.files);
    await api.request(
      `${artifactPath}/custom-code/version/${versionId}/source-snapshot`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body, 'utf8'))
        },
        body
      }
    );
  } catch (error) {
    warn(
      `The source wasn't uploaded (${error instanceof Error ? error.message : String(error)}); the deploy goes on without it.`
    );
  }
};
