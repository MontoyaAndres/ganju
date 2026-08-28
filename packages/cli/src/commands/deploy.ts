import { bundleProject } from '../bundle.js';
import { commandContext, describeTarget } from '../context.js';
import { color, formatBytes, note, step, success } from '../output.js';
import { buildConfig, buildManifest, readTools } from '../project.js';

interface VersionRow {
  id: string;
  version: number;
  status: string;
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
}): Promise<void> => {
  const { project, target, api, artifactPath } = await commandContext();
  const tools = readTools(project);

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
  for (const tool of tools) note(color.gray(`  ${tool.name}`));
};
