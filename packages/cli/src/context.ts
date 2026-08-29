import { ApiClient } from './api.js';
import {
  apiUrlFor,
  loadProject,
  requireTarget,
  type LoadedProject,
  type ProjectTarget
} from './project.js';

/**
 * What every command that touches an artifact needs: the project file, where it
 * points, and a client already pointed there.
 *
 * `artifactPath` is built once here because every endpoint under it is nested
 * the same way, and a command assembling that string itself is a command that
 * can assemble it slightly differently.
 */
export interface CommandContext {
  project: LoadedProject;
  target: ProjectTarget;
  api: ApiClient;
  projectPath: string;
  artifactPath: string;
}

export const commandContext = async (): Promise<CommandContext> => {
  const project = await loadProject();
  const target = requireTarget(project);
  const api = new ApiClient(apiUrlFor(project));
  const projectPath = `/organization/${target.organizationId}/project/${target.projectId}`;
  return {
    project,
    target,
    api,
    projectPath,
    artifactPath: `${projectPath}/artifact`
  };
};

/** The artifact's name for a status line — its slug when we know it, its id otherwise. */
export const describeTarget = (target: ProjectTarget): string =>
  target.artifact ?? target.projectId;
