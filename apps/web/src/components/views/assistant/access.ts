import { useEffect, useState } from 'react';

import { request } from './api';

/**
 * Whether this project's assistant is open: `locked` is a plan without it,
 * `closed` an organization it hasn't reached yet.
 */
export type AssistantAccess = 'loading' | 'open' | 'locked' | 'closed';

const cache = new Map<string, AssistantAccess>();

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
    setAccess('loading');
    request(
      `/organization/${organizationId}/project/${projectId}/builder/conversation`
    ).then(result => {
      const next: AssistantAccess = result.ok
        ? 'open'
        : result.status === 402
          ? 'locked'
          : 'closed';
      // A failed network call is asked again next time.
      if (result.status !== 0) cache.set(key, next);
      if (active) setAccess(next);
    });
    return () => {
      active = false;
    };
  }, [key, organizationId, projectId]);

  return access;
};
