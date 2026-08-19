// Pull a readable message out of an error body returned by a vendor API.
//
// The resource-handler container forwards the vendor's own error body verbatim,
// and the vendors disagree about its shape: Gmail and Microsoft Graph answer
// with `{ error: { code, message, … } }` — an OBJECT — while Slack and the
// container's own guards use a plain string. Reading `.error` straight into an
// Error message turns a perfectly diagnosable failure into "[object Object]",
// which is what every one of these call sites did until a real Gmail rejection
// was put through them.
export const describeVendorError = (body: unknown, fallback: string): string => {
  const error = (body as { error?: unknown } | null | undefined)?.error;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    return JSON.stringify(error).slice(0, 500);
  }
  return fallback;
};
