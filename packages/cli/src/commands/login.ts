import { ApiClient } from '../api.js';
import { clearAccount, readAccount } from '../credentials.js';
import { CliError } from '../errors.js';
import { login as runLogin } from '../oauth.js';
import { color, note, say, success } from '../output.js';
import { apiUrlFor, findProject } from '../project.js';

interface Identity {
  user?: { id?: string; email?: string; name?: string };
}

const whoIs = async (api: ApiClient): Promise<Identity['user']> => {
  const response = await api.request<Identity>('/me');
  return response?.user;
};

/**
 * `ganju login` — sign in on this machine.
 *
 * The API URL is resolved the same way every other command resolves it, so
 * logging in from inside a project that points at a local API signs you in to
 * that one rather than to production.
 */
export const login = async (): Promise<void> => {
  const apiUrl = apiUrlFor(await findProject());

  if (process.env.GANJU_API_TOKEN) {
    throw new CliError(
      'GANJU_API_TOKEN is set, so this machine is already authenticated',
      {
        hint: 'Unset it to log in interactively — a stored login would be ignored while it is set.'
      }
    );
  }

  await runLogin(apiUrl);

  const user = await whoIs(new ApiClient(apiUrl));
  success(
    `logged in to ${apiUrl} as ${color.bold(user?.email ?? user?.id ?? 'unknown')}`
  );
};

export const logout = async (): Promise<void> => {
  const apiUrl = apiUrlFor(await findProject());
  const removed = await clearAccount(apiUrl);
  if (removed) {
    success(`logged out of ${apiUrl}`);
    // Said plainly because it is the difference between this and revoking: the
    // token is gone from this machine, and anything already published stays
    // published.
    note(
      color.gray(
        '  the stored token is deleted; nothing you deployed is changed'
      )
    );
  } else {
    note(`Not logged in to ${apiUrl}`);
  }
};

export const whoami = async (): Promise<void> => {
  const apiUrl = apiUrlFor(await findProject());

  if (process.env.GANJU_API_TOKEN) {
    note(color.gray(`using GANJU_API_TOKEN against ${apiUrl}`));
  } else if (!(await readAccount(apiUrl))?.accessToken) {
    throw new CliError(`Not logged in to ${apiUrl}`, {
      hint: 'Run `ganju login`.'
    });
  }

  const user = await whoIs(new ApiClient(apiUrl));
  say(`${user?.email ?? user?.id ?? 'unknown'} ${color.gray(`(${apiUrl})`)}`);
};
