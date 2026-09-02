// Convert the model's GitHub-flavored markdown into WhatsApp's text formatting
// dialect (what the Cloud API renders in a `text` message body). Mirrors
// slackFormat.ts in shape — protect code spans/fences with placeholders,
// transform line blocks, then inline markup — but emits WhatsApp markup:
//   **bold** / __bold__ → *bold*        *italic* → _italic_
//   ~~strike~~ → ~strike~               `code` / ``` ``` → ```monospace```
//   # heading → *heading*              - item → • item
//   [text](url) → text (url)
// WhatsApp has no rich-link syntax (URLs auto-link) and no HTML, so there is
// nothing to escape — we only rewrite the markers.

const NUL = String.fromCharCode(0);
// Sentinels for bold runs — applied before the single-char italic pass so a
// `**x**` → `*x*` conversion isn't re-mangled by the `*italic*` rule, then
// restored to a single `*` at the end (WhatsApp bold is a single asterisk).
const BOLD_OPEN = String.fromCharCode(1);
const BOLD_CLOSE = String.fromCharCode(2);

const processInline = (text: string): string => {
  let r = text;

  // Bold (double markers) → sentinels.
  r = r.replace(/\*\*([^*\n]+?)\*\*/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);
  r = r.replace(/__([^_\n]+?)__/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);

  // Italic: markdown *italic* → WhatsApp _italic_. Underscore italic (_x_) is
  // already valid WhatsApp markup, so it's left untouched. Word-boundary guards
  // avoid turning a bare `*` or a mid-word asterisk into emphasis.
  r = r.replace(/(^|[^*\w])\*([^*\n]+?)\*(?=[^*\w]|$)/g, '$1_$2_');

  // Strikethrough: ~~x~~ → ~x~ (WhatsApp uses a single tilde).
  r = r.replace(/~~([^~\n]+?)~~/g, '~$1~');

  // Links: WhatsApp can't render a labelled link, so surface both the label and
  // the (auto-linking) url. Drop the parens when they'd just repeat the url.
  r = r.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    (_, label: string, url: string) =>
      label === url ? url : `${label} (${url})`
  );

  // Restore bold sentinels to WhatsApp's single-asterisk bold.
  r = r.split(BOLD_OPEN).join('*').split(BOLD_CLOSE).join('*');

  return r;
};

export const markdownToWhatsapp = (markdown: string): string => {
  const fences: string[] = [];
  let text = markdown.replace(
    /```([\w+-]*)\n?([\s\S]*?)```/g,
    (_, _lang: string, code: string) => {
      const idx = fences.length;
      // WhatsApp renders text wrapped in triple backticks as a monospace block.
      fences.push(`\`\`\`\n${code.replace(/\n$/, '')}\n\`\`\``);
      return `${NUL}F${idx}${NUL}`;
    }
  );

  const codes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const idx = codes.length;
    // WhatsApp has no single-backtick inline code; render it as inline monospace.
    codes.push(`\`\`\`${code}\`\`\``);
    return `${NUL}C${idx}${NUL}`;
  });

  const lines = text.split('\n');
  const processed = lines.map(line => {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) return `*${processInline(heading[2])}*`;

    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) return processInline(quote[1]);

    const list = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.+)$/);
    if (list) return `${list[1]}• ${processInline(list[2])}`;

    if (/^\s*[-=*_]{3,}\s*$/.test(line)) return '───';

    return processInline(line);
  });

  let result = processed.join('\n');

  const restoreRe = new RegExp(`${NUL}([CF])(\\d+)${NUL}`, 'g');
  result = result.replace(restoreRe, (_, kind: string, idx: string) =>
    kind === 'C' ? codes[Number(idx)] : fences[Number(idx)]
  );

  return result;
};
