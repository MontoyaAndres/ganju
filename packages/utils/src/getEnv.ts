export interface EnvSource {
  env?: Record<string, unknown> | unknown;
}

export const getEnv = (source: EnvSource, key: string): string | undefined => {
  const env = (source.env as Record<string, unknown> | undefined) || undefined;
  const value = env?.[key];
  if (typeof value === 'string') return value;
  return process.env[key];
};
