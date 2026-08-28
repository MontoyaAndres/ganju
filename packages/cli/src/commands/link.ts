import { ApiClient } from '../api.js';
import { CliError } from '../errors.js';
import { color, note, success } from '../output.js';
import { select } from '../prompt.js';
import {
  PROJECT_FILE,
  apiUrlFor,
  findProject,
  loadProject,
  writeProjectFile
} from '../project.js';

interface OrganizationRow {
  id: string;
  name: string;
  plan?: string;
  projects?: Array<{ id: string; name: string; isMember?: boolean }>;
}

interface ArtifactRow {
  id?: string;
  slug?: string;
}

/**
 * `ganju link` — point this `ganju.json` at an organization and project.
 *
 * Ids get written, not the slug, because ids are what every endpoint is keyed
 * by. The slug is written beside them as the readable half: a deploy that
 * reported a uuid would leave the author checking the dashboard to find out
 * which MCP server they just changed.
 */
export const link = async (flags: {
  organization?: string;
  project?: string;
}): Promise<void> => {
  const project = (await findProject()) ?? null;
  if (!project) {
    throw new CliError(
      `No ${PROJECT_FILE} found in this directory or any above it`,
      {
        hint: 'Run `ganju init` first.'
      }
    );
  }

  const api = new ApiClient(apiUrlFor(project));
  const organizations = await api.request<OrganizationRow[]>('/organization');

  if (!organizations?.length) {
    throw new CliError('You do not belong to any organization yet', {
      hint: 'Create one in the dashboard, then run `ganju link` again.'
    });
  }

  const organization = flags.organization
    ? pick(organizations, flags.organization, 'organization')
    : await select(
        'Which organization?',
        organizations.map(row => ({
          label: row.name,
          detail: row.plan ? `${row.plan.toLowerCase()} · ${row.id}` : row.id,
          value: row
        }))
      );

  // Project membership is independent of organization membership, so the list
  // an org returns is already narrowed to what this user can actually reach.
  const projects = organization.projects ?? [];
  if (projects.length === 0) {
    throw new CliError(`${organization.name} has no projects you can reach`, {
      hint: 'Create one in the dashboard, or ask to be added to an existing one.'
    });
  }

  const chosen = flags.project
    ? pick(projects, flags.project, 'project')
    : await select(
        `Which project in ${organization.name}?`,
        projects.map(row => ({ label: row.name, detail: row.id, value: row }))
      );

  // Read the slug now rather than at deploy time: it is also the first request
  // that proves this user really is an admin of the project they just picked.
  const artifact = await api
    .request<ArtifactRow>(
      `/organization/${organization.id}/project/${chosen.id}/artifact`
    )
    .catch(() => null);

  await writeProjectFile(project.path, {
    ...project.file,
    ...(artifact?.slug ? { artifact: artifact.slug } : {}),
    organizationId: organization.id,
    projectId: chosen.id
  });

  success(
    `linked to ${color.bold(chosen.name)} in ${organization.name}` +
      (artifact?.slug ? ` ${color.gray(`(${artifact.slug})`)}` : '')
  );
  note(color.gray(`  written to ${project.path}`));
};

const pick = <T extends { id: string; name: string }>(
  rows: T[],
  needle: string,
  label: string
): T => {
  const match = rows.find(
    row => row.id === needle || row.name.toLowerCase() === needle.toLowerCase()
  );
  if (!match) {
    throw new CliError(`No ${label} named "${needle}"`, {
      hint: `Available: ${rows.map(row => row.name).join(', ')}`
    });
  }
  return match;
};

/** `ganju link --status` in everything but name: what the file currently points at. */
export const showLink = async (): Promise<void> => {
  const project = await loadProject();
  const { organizationId, projectId, artifact } = project.file;
  if (!organizationId || !projectId) {
    note(`${project.path} is not linked to a project yet`);
    return;
  }
  note(`${project.path}`);
  note(`  organization ${organizationId}`);
  note(`  project      ${projectId}`);
  if (artifact) note(`  artifact     ${artifact}`);
};
