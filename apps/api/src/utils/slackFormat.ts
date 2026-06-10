// Convert the model's GitHub-flavored markdown into Slack mrkdwn (the dialect
// chat.postMessage renders). Mirrors telegramFormat.ts in shape — protect code
// spans/fences with placeholders, transform line blocks, then inline markup —
// but emits mrkdwn instead of HTML:
//   **bold** / __bold__ → *bold*       *italic* → _italic_
//   ~~strike~~ → ~strike~              [text](url) → <url|text>
//   # heading → *heading*              - item → • item
// Slack only requires escaping &, <, > in text; we escape first, then introduce
// the literal <…> link syntax, so user content can't forge a link or entity.

const NUL = String.fromCharCode(0);
// Sentinels for bold runs — applied before the single-char italic pass so a
// `**x**` → `*x*` conversion isn't re-mangled by the `*italic*` rule, then
// restored to a single `*` at the end.
const BOLD_OPEN = String.fromCharCode(1);
const BOLD_CLOSE = String.fromCharCode(2);

const escapeMrkdwn = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const processInline = (text: string): string => {
  let r = escapeMrkdwn(text);

  // Bold (double markers) → sentinels.
  r = r.replace(/\*\*([^*\n]+?)\*\*/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);
  r = r.replace(/__([^_\n]+?)__/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);

  // Italic: markdown *italic* → mrkdwn _italic_. Underscore italic (_x_) is
  // already valid mrkdwn, so it's left untouched. Word-boundary guards avoid
  // turning a bare `*` or mid-word asterisk into emphasis.
  r = r.replace(/(^|[^*\w])\*([^*\n]+?)\*(?=[^*\w]|$)/g, '$1_$2_');

  // Strikethrough.
  r = r.replace(/~~([^~\n]+?)~~/g, '~$1~');

  // Links: [text](url) → <url|text>.
  r = r.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '<$2|$1>');

  // Restore bold sentinels to mrkdwn's single-asterisk bold.
  r = r.split(BOLD_OPEN).join('*').split(BOLD_CLOSE).join('*');

  return r;
};

export const markdownToSlackMrkdwn = (markdown: string): string => {
  const fences: string[] = [];
  let text = markdown.replace(
    /```([\w+-]*)\n?([\s\S]*?)```/g,
    (_, _lang: string, code: string) => {
      const idx = fences.length;
      // Slack renders ``` fenced blocks verbatim; only &<> need escaping.
      fences.push(`\`\`\`\n${escapeMrkdwn(code.replace(/\n$/, ''))}\n\`\`\``);
      return `${NUL}F${idx}${NUL}`;
    }
  );

  const codes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const idx = codes.length;
    codes.push(`\`${escapeMrkdwn(code)}\``);
    return `${NUL}C${idx}${NUL}`;
  });

  const lines = text.split('\n');
  const processed = lines.map(line => {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) return `*${processInline(heading[2])}*`;

    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) return `> ${processInline(quote[1])}`;

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
