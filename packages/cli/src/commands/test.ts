import { readFile } from 'node:fs/promises';

import type { ApiClient } from '../api.js';
import { bundleProject } from '../bundle.js';
import { commandContext } from '../context.js';
import { CliError } from '../errors.js';
import {
  color,
  formatDuration,
  json as printJson,
  note,
  say,
  step,
  success,
  fail
} from '../output.js';
import {
  buildConfig,
  buildManifest,
  readTools,
  type LoadedProject
} from '../project.js';

interface VersionRow {
  id: string;
  version: number;
  status: string;
}

interface VersionList {
  activeVersionId: string | null;
  versions: VersionRow[];
}

interface TestResult {
  ran: boolean;
  output?: unknown;
  error?: string | null;
  logs?: string[];
  durationMs?: number;
  inputViolations?: SchemaViolation[];
  outputViolations?: SchemaViolation[];
}

/**
 * One reason a value did not match a schema, as the server reports it.
 *
 * The path is the useful half — `orderId` rather than "Required" on its own —
 * so it is a pair rather than a sentence, and printing the pair as-is is what
 * turned it into `[object Object]` the first time this ran for real.
 */
interface SchemaViolation {
  path?: string;
  message?: string;
}

const describeViolation = (violation: SchemaViolation): string =>
  violation.path
    ? `${violation.path}: ${violation.message ?? ''}`
    : (violation.message ?? String(violation));

/**
 * `ganju test` — run one tool against a sample input without putting it in front
 * of anyone.
 *
 * The server deploys the version to a preview script nothing dispatches to,
 * calls it once, and deletes it. So this is the real thing: real connections,
 * real secrets, real egress rules — and the live version keeps serving clients
 * the whole time.
 *
 * By default it tests the code in front of you, which means uploading it first:
 * a draft is created and the bundle attached, exactly as `ganju deploy --draft`
 * would, and nothing is published. `--version` skips all of that and tests one
 * that already exists.
 */
export const test = async (
  toolName: string | undefined,
  flags: {
    input?: string;
    inputFile?: string;
    version?: string;
    json?: boolean;
  }
): Promise<void> => {
  if (!toolName) {
    throw new CliError('Which tool should be tested?', {
      hint: 'ganju test <tool> --input \'{"orderId":"A-1"}\''
    });
  }

  const { project, api, artifactPath } = await commandContext();
  const input = await readInput(flags);

  const versionId = flags.version
    ? await resolveVersion(api, artifactPath, flags.version)
    : await uploadDraft(project, api, artifactPath);

  step(`running ${color.bold(toolName)}`);
  const result = await api.request<TestResult>(
    `${artifactPath}/custom-code/version/${versionId}/test`,
    { method: 'POST', json: { tool: toolName, input } }
  );

  if (flags.json) {
    printJson(result);
    if (!result.ran || result.error) process.exitCode = 1;
    return;
  }

  report(result);
};

const report = (result: TestResult): void => {
  for (const line of result.logs ?? []) {
    note(`${color.gray('│')} ${line}`);
  }

  // Checked before anything was deployed, so this is the one failure that costs
  // nothing — and it is the same refusal an MCP client would have made.
  if (!result.ran) {
    fail("the input does not match the tool's own input schema");
    for (const violation of result.inputViolations ?? []) {
      note(`  ${describeViolation(violation)}`);
    }
    process.exitCode = 1;
    return;
  }

  const took = result.durationMs
    ? color.gray(` in ${formatDuration(result.durationMs)}`)
    : '';

  if (result.error) {
    fail(`the tool returned an error${took}`);
    note(`  ${result.error}`);
    process.exitCode = 1;
    return;
  }

  success(`ran${took}`);
  say(
    typeof result.output === 'string'
      ? result.output
      : JSON.stringify(result.output, null, 2)
  );

  // A declared output schema is a promise to the MCP client, and one the boot
  // loop enforces: a tool that declares one and returns something else becomes
  // an error for the whole call. Better to read it here.
  if (result.outputViolations?.length) {
    fail('the output does not match the declared output schema');
    for (const violation of result.outputViolations) {
      note(`  ${describeViolation(violation)}`);
    }
    process.exitCode = 1;
  }
};

const readInput = async (flags: {
  input?: string;
  inputFile?: string;
}): Promise<Record<string, unknown>> => {
  if (flags.input && flags.inputFile) {
    throw new CliError('Pass --input or --input-file, not both');
  }
  const raw = flags.inputFile
    ? await readFile(flags.inputFile, 'utf8').catch(() => {
        throw new CliError(`Could not read ${flags.inputFile}`);
      })
    : flags.input;

  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError(
      `The input is not valid JSON — ${error instanceof Error ? error.message : String(error)}`,
      { hint: 'Quote it for your shell: --input \'{"orderId":"A-1"}\'' }
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError('The input must be a JSON object');
  }
  return parsed as Record<string, unknown>;
};

const resolveVersion = async (
  api: ApiClient,
  artifactPath: string,
  requested: string
): Promise<string> => {
  const list = await api.request<VersionList>(
    `${artifactPath}/custom-code/versions`
  );

  if (requested === 'active') {
    if (!list.activeVersionId) {
      throw new CliError('This artifact has no live version yet', {
        hint: 'Run `ganju deploy` first, or test the current code with no --version.'
      });
    }
    return list.activeVersionId;
  }
  if (requested === 'latest') {
    const newest = list.versions[0];
    if (!newest) throw new CliError('This artifact has no versions yet');
    return newest.id;
  }

  const number = Number.parseInt(requested, 10);
  const match = list.versions.find(row =>
    Number.isInteger(number) ? row.version === number : row.id === requested
  );
  if (!match) {
    throw new CliError(`No version "${requested}"`, {
      hint: 'Run `ganju versions` to see what exists. `latest` and `active` also work.'
    });
  }
  return match.id;
};

/**
 * Upload the current code as a draft so it can be tested.
 *
 * This does leave a version row behind — the same one the dashboard's Save draft
 * button leaves — because a version is the unit of both code and contract, and
 * there is nothing for the test endpoint to name that is not one.
 */
const uploadDraft = async (
  project: LoadedProject,
  api: ApiClient,
  artifactPath: string
): Promise<string> => {
  const tools = readTools(project);

  step('bundling the current code');
  const bundle = await bundleProject(project, tools, { minify: true });

  const config = buildConfig(project.file);
  const version = await api.request<VersionRow>(
    `${artifactPath}/custom-code/version`,
    {
      method: 'POST',
      json: { manifest: buildManifest(tools), ...(config ? { config } : {}) }
    }
  );

  await api.request(
    `${artifactPath}/custom-code/version/${version.id}/bundle`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/javascript',
        'content-length': String(Buffer.byteLength(bundle.code, 'utf8'))
      },
      body: bundle.code
    }
  );

  note(color.gray(`  saved as draft v${version.version} — not published`));
  return version.id;
};
