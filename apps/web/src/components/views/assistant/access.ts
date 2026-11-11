import { useEffect, useState } from 'react';

import { request } from './api';

/**
 * Whether this project's assistant is open: `locked` is a plan without it,
 * `closed` a project it can't be found for, or a check that kept failing.
 */
export type AssistantAccess = 'loading' | 'open' | 'locked' | 'closed';

// Only the answers that don't change within a visit. A plan can be upgraded
// meanwhile, so `locked` is asked again.
const cache = new Map<string, AssistantAccess>();

const RETRY_MS = [2000, 5000, 10000];

export const useAssistantAccess = (
  organizationId?: string | null,
  projectId?: string | null
): AssistantAccess => {
  const key =
    organizationId && projectId ? `${organizationId}:${projectId}` : '';
  const [access, setAccess] = useState<AssistantAccess>(
    () => cache.get(key) ?? 'loading'
  );

  useEffect(() => {
    if (!key) return;
    const known = cache.get(key);
    if (known) {
      setAccess(known);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setAccess('loading');

    const ask = async (attempt: number) => {
      const result = await request(
        `/organization/${organizationId}/project/${projectId}/builder/access`
      );
      if (!active) return;
      if (result.ok || result.status === 404) {
        const next = result.ok ? 'open' : 'closed';
        cache.set(key, next);
        setAccess(next);
        return;
      }
      if (result.status === 402) {
        setAccess('locked');
        return;
      }
      // A failure that says nothing about access: stay undecided (the
      // Functions tab stays read-only meanwhile) and ask again.
      if (attempt < RETRY_MS.length) {
        timer = setTimeout(() => ask(attempt + 1), RETRY_MS[attempt]);
      } else {
        setAccess('closed');
      }
    };
    ask(0);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [key, organizationId, projectId]);

  return access;
};
