/**
 * The Hacker News API: public, no key, and one request per story.
 *
 * That last part is why `limit` is capped at 15. Every `fetch` a tool makes
 * counts against the project's outbound request budget, so a digest of 15
 * stories costs 16 requests.
 */

const API = 'https://hacker-news.firebaseio.com/v0';

interface Item {
  id: number;
  title?: string;
  url?: string;
  by?: string;
  score?: number;
  descendants?: number;
  type?: string;
  dead?: boolean;
  deleted?: boolean;
}

export interface Story {
  title: string;
  url: string;
  discussion: string;
  points: number;
  comments: number;
  by: string;
}

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API}/${path}`);
  if (!response.ok) {
    throw new Error(`Hacker News answered ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
};

/** The current front page, in rank order. */
export const topStories = async (limit: number): Promise<Story[]> => {
  const ids = await getJson<number[]>('topstories.json');

  // In parallel: one slow item should not hold up the rest.
  const items = await Promise.all(
    ids.slice(0, limit).map(id => getJson<Item | null>(`item/${id}.json`))
  );

  return items
    .filter((item): item is Item => !!item && !item.dead && !item.deleted)
    .map(item => {
      const discussion = `https://news.ycombinator.com/item?id=${item.id}`;
      return {
        title: item.title ?? '(untitled)',
        // "Ask HN" and "Show HN" posts have no link of their own.
        url: item.url ?? discussion,
        discussion,
        points: item.score ?? 0,
        comments: item.descendants ?? 0,
        by: item.by ?? 'unknown'
      };
    });
};

/** The stories as a Markdown document, for the email attachment. */
export const toMarkdown = (stories: Story[], date: string): string =>
  [
    `# Hacker News — ${date}`,
    '',
    ...stories.map(
      (story, index) =>
        `${index + 1}. [${story.title}](${story.url})  \n` +
        `   ${story.points} points · ${story.comments} comments · by ${story.by} · [discussion](${story.discussion})`
    ),
    ''
  ].join('\n');

/** The same list as plain text, for the body of the email. */
export const toPlainText = (stories: Story[]): string =>
  stories
    .map(
      (story, index) =>
        `${index + 1}. ${story.title}\n   ${story.url}\n   ${story.points} points · ${story.comments} comments`
    )
    .join('\n\n');
