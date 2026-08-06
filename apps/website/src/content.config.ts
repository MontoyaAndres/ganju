import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ base: './src/content/docs', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().default(100),
    updated: z.coerce.date().optional()
  })
});

/**
 * The Spanish docs are a parallel tree, not a `lang` field on the English one:
 * the collection is what `getCollection` iterates to build routes, and keeping
 * them separate means neither language can accidentally leak into the other's
 * sidebar, `llms.txt`, or `/docs.md` index. File ids match one-to-one across
 * the two trees — `tools/gmail` here is `tools/gmail` there — which is what
 * makes the hreflang pairing mechanical.
 */
const docsEs = defineCollection({
  loader: glob({ base: './src/content/docs-es', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().default(100),
    updated: z.coerce.date().optional()
  })
});

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().default('Ganju'),
    draft: z.boolean().default(false)
  })
});

export const collections = { docs, docsEs, blog };
