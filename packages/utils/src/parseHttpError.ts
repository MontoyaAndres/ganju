export const parseHttpErrorMessage = async (
  response: Response
): Promise<string> => {
  const raw = await response.text();
  if (!raw) return `${response.status} ${response.statusText}`;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message && typeof parsed.error.message === 'string') {
      return parsed.error.message;
    }
    if (typeof parsed?.error === 'string') return parsed.error;
    if (typeof parsed?.message === 'string') return parsed.message;
    return raw;
  } catch {
    return raw;
  }
};
