// Phase-0 spike for the builder: how much does Claude Opus 5.5 cost per owner
// request, how many turns does it take, and does the result work with no hand
// edits? Runs the golden requests in scripts/golden/builder-requests.json
// against the dev API, each in a fresh project of a throwaway organization.
//
//   node scripts/eval-builder.mjs --case pizza-stock --verbose
//   node scripts/eval-builder.mjs --out scripts/golden/builder-baseline-opus-5-5.json
//   node scripts/eval-builder.mjs --repeat 3 --baseline scripts/golden/builder-baseline-opus-5-5.json
//
// Every run creates a project named "builder-eval <case> <run>" in
// EVAL_ORG (default: the dev qa-timecap org) and leaves it there; nothing is
// deleted. The owner is simulated by Claude Opus 5.5 at low effort, answering
// only from the case's brief and clicking Apply on every change set. Customer
// questions are asked the way a channel runs: the shared model
// (utils.constants.DEFAULT_LLM_MODEL) over the project's MCP server, with the
// owner's token (so the owner's view of tables, not a customer's). A judge
// (Opus 5.5) reads the conversation, what was built and the probe answers.
//
// Needs: ANTHROPIC_API_KEY and EMBEDDING_API_KEY (.env), and a CLI sign-in on
// dev (~/.ganju/credentials.json), which the script refreshes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { utils } from '@ganju/utils';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = fs.existsSync(path.join(ROOT, '.env'))
  ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  : '';
const readEnv = key =>
  process.env[key] ??
  envFile
    .match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
    ?.replace(/\s+#.*$/, '')
    .trim();
process.env.ANTHROPIC_API_KEY ??= readEnv('ANTHROPIC_API_KEY');

const { api, projectApi, mcp, toolText } =
  await import('./builder-eval/api.mjs');
const { step, ask, textOf, emptyUsage, addUsage, mergeUsage, credits, MODEL } =
  await import('./builder-eval/llm.mjs');
const { toolDefinitions, createSession } =
  await import('./builder-eval/tools.mjs');
const { builderSystemPrompt } = await import('./builder-eval/prompt.mjs');
const { TEMPLATES } = await import('./builder-eval/templates.mjs');

// Arguments

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const list = v =>
  v
    ? v
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;
const goldenPath =
  flag('--golden') ?? path.join(ROOT, 'scripts/golden/builder-requests.json');
const onlyCases = list(flag('--case'));
const repeat = Number(flag('--repeat') ?? 1);
const concurrency = Number(flag('--concurrency') ?? 3);
const effort = flag('--effort') ?? 'high';
const outPath = flag('--out');
const baselinePath = flag('--baseline');
const verbose = args.includes('--verbose');
const ORG = process.env.EVAL_ORG ?? '01a1b287-8e90-731f-b600-aadf64c28832';

const MAX_TOOL_STEPS = 25; // model calls per owner message
const MAX_OWNER_TURNS = 5;

const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
const cases = golden.cases.filter(c => !onlyCases || onlyCases.includes(c.id));
const SYSTEM = builderSystemPrompt(ROOT);

// The channel's shared model, through the runner's own adapter

const loadAdapter = async () => {
  const outfile = path.join(
    os.tmpdir(),
    `ganju-builder-eval-llm-${process.pid}.mjs`
  );
  await build({
    entryPoints: [path.join(ROOT, 'apps/api/src/utils/llm/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    logLevel: 'error',
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
    }
  });
  const module = await import(outfile);
  fs.rmSync(outfile, { force: true });
  return module.getLlmAdapter(utils.constants.DEFAULT_LLM_PROVIDER);
};
const sharedAdapter = await loadAdapter();
const SHARED_KEY = readEnv('EMBEDDING_API_KEY');

const customerTurn = async (slug, question) => {
  const listed = await mcp(slug, 'tools/list');
  const tools = listed.tools
    .slice(0, utils.constants.CHANNEL_MAX_TOOLS ?? 40)
    .map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema
    }));
  const systemPrompt = [
    `Current date and time: ${new Date().toISOString()}. The user's time zone is America/Bogota; resolve relative dates and times ("today", "tomorrow", "9am") in that zone. ${utils.UNTRUSTED_CONTENT_NOTE}`,
    utils.constants.DEFAULT_LLM_SYSTEM_PROMPT
  ].join('\n\n');
  const messages = [{ role: 'user', content: question }];
  const calls = [];
  for (let i = 0; i < 6; i++) {
    const completion = await sharedAdapter.complete({
      model: utils.constants.DEFAULT_LLM_MODEL,
      apiKey: SHARED_KEY,
      systemPrompt,
      messages,
      tools,
      toolChoice: i === 5 ? 'none' : undefined
    });
    if (!completion.assistant.toolCalls?.length)
      return { answer: completion.assistant.content, calls };
    messages.push({
      role: 'assistant',
      content: completion.assistant.content,
      toolCalls: completion.assistant.toolCalls
    });
    for (const call of completion.assistant.toolCalls) {
      let text;
      try {
        text = toolText(
          await mcp(slug, 'tools/call', {
            name: call.name,
            arguments: call.arguments
          })
        );
      } catch (error) {
        text = `Error: ${error.message}`;
      }
      calls.push({
        tool: call.name,
        arguments: call.arguments,
        result: text.slice(0, 1500)
      });
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: text
      });
    }
  }
  return { answer: '(no answer after 6 steps)', calls };
};

// The simulated owner

const OWNER_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    done: {
      type: 'boolean',
      description:
        'true when the assistant says it finished and you have nothing to add'
    }
  },
  required: ['reply', 'done'],
  additionalProperties: false
};

const ownerSystem =
  c => `You play the owner of a small business talking to an assistant that sets up your WhatsApp bot. You don't write code and don't know technical words.
What you know and want: ${c.owner}
Rules: answer in ${c.lang === 'es' ? 'Spanish (Colombia), informal' : 'English'}; short, one to three sentences, the way people type in a chat. Answer only from what you know above; if asked something else, say you don't know or pick the simplest option. Don't volunteer facts nobody asked about, except the ones you'd naturally mention when they ask what you want. Never write code. When the assistant says it's done (or only offers optional extras), set done to true with a short thanks.`;

const ownerReply = async (c, transcript, usage) =>
  ask({
    system: ownerSystem(c),
    prompt: `The conversation so far (you are "owner"):\n\n${transcript}\n\nWrite your next message to the assistant.`,
    schema: OWNER_SCHEMA,
    usage
  });

// The judge

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    works: {
      type: 'boolean',
      description:
        "The owner's request works with no hand edits, per the rubric"
    },
    asked_before_building: { type: 'boolean' },
    plain_words: {
      type: 'boolean',
      description: 'Never showed the owner code, JSON or technical words'
    },
    honest: {
      type: 'boolean',
      description:
        'Claimed nothing that was not built and tested; stated limits plainly'
    },
    notes: { type: 'string' }
  },
  required: [
    'works',
    'asked_before_building',
    'plain_words',
    'honest',
    'notes'
  ],
  additionalProperties: false
};

const judge = async (c, evidence, usage) =>
  ask({
    system:
      'You grade an AI assistant that builds a small business bot for a non-technical owner. Be strict and concrete: "works" means a customer or the owner would get what the owner asked for today, without anyone editing anything by hand. Customer answers come from a small model; judge the built pieces, and do not fail the case only because that model phrased something badly when the data or action behind it is right.',
    prompt: `Owner's request: ${c.ask}\nWhat the owner knew and wanted: ${c.owner}\n\nRubric: ${c.expect.rubric}\n\n${evidence}`,
    schema: JUDGE_SCHEMA,
    effort: 'medium',
    usage
  });

// One run of one case

const transcriptText = turns =>
  turns
    .map(t => `${t.role === 'owner' ? 'owner' : 'assistant'}: ${t.text}`)
    .join('\n\n');

const runCase = async (c, runIndex) => {
  const started = Date.now();
  const tag = `${c.id}#${runIndex + 1}`;
  const log = (...m) => verbose && console.log(`[${tag}]`, ...m);
  const builderUsage = emptyUsage();
  const sideUsage = emptyUsage(); // owner simulation and judge
  const result = { id: c.id, run: runIndex + 1, lang: c.lang, kind: c.kind };

  const project = await api('POST', `/organization/${ORG}/project`, {
    json: {
      name: `builder-eval ${c.id} ${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '')}${runIndex ? `-${runIndex + 1}` : ''}`.slice(
        0,
        100
      )
    }
  });
  const p = projectApi(ORG, project.id);
  const slug = (await p.get('/artifact')).slug;
  result.projectId = project.id;
  result.slug = slug;
  log('project', project.id, slug);

  const turns = [{ role: 'owner', text: c.ask }];
  const owner = async message => {
    const reply = await ownerReply(
      c,
      transcriptText([...turns, { role: 'assistant', text: message }]),
      sideUsage
    );
    return reply.reply;
  };
  const session = createSession({
    p,
    slug,
    ownerFiles: c.start.ownerFiles ?? [],
    owner,
    log
  });
  await TEMPLATES[c.start.template]({ p, slug, session });

  const messages = [{ role: 'user', content: c.ask }];
  let modelCalls = 0;
  let toolCalls = 0;
  let ownerTurns = 1;
  let firstTurnChanged = false;
  let stoppedBy = 'owner-done';

  for (;;) {
    // One owner message: the tool loop until the assistant ends its turn.
    const turnStartApplied = session.applied.length;
    let ended = false;
    for (let i = 0; i < MAX_TOOL_STEPS; i++) {
      const { message } = await step({
        system: SYSTEM,
        tools: toolDefinitions,
        messages,
        effort,
        usage: builderUsage
      });
      modelCalls++;
      messages.push({ role: 'assistant', content: message.content });
      if (message.stop_reason === 'refusal') {
        stoppedBy = 'refusal';
        ended = true;
        break;
      }
      const uses = message.content.filter(b => b.type === 'tool_use');
      if (!uses.length) {
        ended = true;
        break;
      }
      const results = await Promise.all(
        uses.map(async u => {
          toolCalls++;
          log(`  → ${u.name} ${JSON.stringify(u.input).slice(0, 140)}`);
          const r = await session.call(u.name, u.input);
          if (r.isError) log(`    ✗ ${r.content.slice(0, 200)}`);
          return {
            type: 'tool_result',
            tool_use_id: u.id,
            content: r.content,
            is_error: r.isError
          };
        })
      );
      messages.push({ role: 'user', content: results });
    }
    const said = textOf(
      messages.at(-1).role === 'assistant'
        ? { content: messages.at(-1).content }
        : { content: [] }
    );
    turns.push({ role: 'assistant', text: said || '(no message)' });
    log(`assistant: ${said.slice(0, 600)}`);
    if (ownerTurns === 1 && session.applied.length > turnStartApplied)
      firstTurnChanged = true;
    if (!ended) {
      stoppedBy = 'step-cap';
      break;
    }
    if (stoppedBy === 'refusal') break;
    if (ownerTurns >= MAX_OWNER_TURNS) {
      stoppedBy = 'owner-turn-cap';
      break;
    }
    const reply = await ownerReply(c, transcriptText(turns), sideUsage);
    log(`owner: ${reply.reply}${reply.done ? ' [done]' : ''}`);
    if (reply.done) break;
    turns.push({ role: 'owner', text: reply.reply });
    messages.push({ role: 'user', content: reply.reply });
    ownerTurns++;
  }

  // What was built, and the probes
  await new Promise(r =>
    setTimeout(r, c.start.ownerFiles?.length ? 45_000 : 5_000)
  ); // indexing
  const built = await session.overview().catch(e => ({ error: e.message }));
  const live = await session.readVersion().catch(() => null);
  const probes = [];
  for (const probe of c.expect.probes ?? []) {
    try {
      if (probe.customer) {
        const r = await customerTurn(slug, probe.customer);
        probes.push({
          customer: probe.customer,
          answer: r.answer,
          calls: r.calls
        });
      } else if (probe.tool) {
        const versionId = live?.liveVersionId;
        const r = versionId
          ? await p.post(`/artifact/custom-code/version/${versionId}/test`, {
              tool: probe.tool,
              input: probe.input ?? {}
            })
          : { error: 'no live version' };
        probes.push({ tool: probe.tool, input: probe.input, result: r });
      }
    } catch (error) {
      probes.push({ ...probe, error: error.message });
    }
  }

  const evidence = [
    `Conversation:\n${transcriptText(turns)}`,
    `Cards shown to the owner:\n${JSON.stringify(session.cards, null, 1)}`,
    `Project after the run:\n${JSON.stringify(built, null, 1)}`,
    live?.shown
      ? `Live actions' code (${live.shown.versionId}):\n${JSON.stringify(live.shown.files, null, 1).slice(0, 12000)}`
      : 'No actions.',
    `Probes (customer questions answered by the bot, and action tests):\n${JSON.stringify(probes, null, 1).slice(0, 12000)}`,
    `Tests the assistant ran itself (run_test), in order:\n${JSON.stringify(session.tests, null, 1).slice(0, 10000)}`,
    `Changes still staged but never applied: ${JSON.stringify(session.staged.map(s => s.label))}`
  ].join('\n\n');
  const verdict = await judge(c, evidence, sideUsage).catch(e => ({
    works: false,
    notes: `judge failed: ${e.message}`
  }));

  Object.assign(result, {
    works: !!verdict.works,
    verdict,
    asksFirst: !firstTurnChanged && /\?/.test(turns[1]?.text ?? ''),
    stoppedBy,
    ownerTurns,
    modelCalls,
    toolCalls,
    toolCounts: session.counts,
    cards: session.cards.map(x => x.kind),
    applied: session.applied.map(a => `${a.area}.${a.op}`),
    builder: { ...builderUsage, credits: credits(builderUsage.usd) },
    sideUsd: Math.round(sideUsage.usd * 1000) / 1000,
    seconds: Math.round((Date.now() - started) / 1000),
    transcript: turns,
    probes
  });
  console.log(
    `${verdict.works ? 'PASS' : 'FAIL'} ${tag.padEnd(22)} ${String(result.builder.credits).padStart(6)} credits  ${modelCalls} calls  ${ownerTurns} owner msgs  ${result.seconds}s  ${verdict.notes?.slice(0, 140) ?? ''}`
  );
  return result;
};

// Run everything

const jobs = cases.flatMap(c =>
  Array.from({ length: repeat }, (_, i) => [c, i])
);
const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const [c, i] = jobs[next++];
      try {
        results.push(await runCase(c, i));
      } catch (error) {
        console.log(`ERROR ${c.id}#${i + 1}: ${error.stack ?? error.message}`);
        results.push({
          id: c.id,
          run: i + 1,
          works: false,
          error: error.message
        });
      }
    }
  })
);

// Summary

const ok = results.filter(r => !r.error);
const sum = ok.reduce((acc, r) => mergeUsage(acc, r.builder), emptyUsage());
const byCase = Object.fromEntries(
  cases.map(c => {
    const runs = results.filter(r => r.id === c.id);
    return [
      c.id,
      {
        passRate: runs.filter(r => r.works).length / (runs.length || 1),
        credits: runs.map(r => r.builder?.credits ?? null),
        modelCalls: runs.map(r => r.modelCalls ?? null),
        ownerTurns: runs.map(r => r.ownerTurns ?? null)
      }
    ];
  })
);
const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const summary = {
  model: MODEL,
  effort,
  date: new Date().toISOString(),
  runs: results.length,
  passed: results.filter(r => r.works).length,
  credits: {
    total: credits(sum.usd),
    perRun: Math.round(avg(ok.map(r => r.builder.credits)) * 10) / 10,
    max: Math.max(0, ...ok.map(r => r.builder.credits))
  },
  tokens: {
    input: sum.input,
    output: sum.output,
    cacheRead: sum.cacheRead,
    write5m: sum.write5m,
    write1h: sum.write1h
  },
  modelCallsPerRun: Math.round(avg(ok.map(r => r.modelCalls)) * 10) / 10,
  ownerTurnsPerRun: Math.round(avg(ok.map(r => r.ownerTurns)) * 10) / 10,
  sideUsd: Math.round(ok.reduce((a, r) => a + r.sideUsd, 0) * 100) / 100,
  byCase
};
console.log('\n' + JSON.stringify({ ...summary, byCase: undefined }, null, 2));
for (const [id, s] of Object.entries(byCase))
  console.log(
    `  ${id.padEnd(18)} pass ${Math.round(s.passRate * 100)}%  credits ${s.credits.join(', ')}  calls ${s.modelCalls.join(', ')}`
  );

if (baselinePath && fs.existsSync(baselinePath)) {
  const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).summary;
  console.log('\nAgainst the baseline:');
  for (const [id, s] of Object.entries(byCase)) {
    const b = base.byCase?.[id];
    if (!b) continue;
    const delta = s.passRate - b.passRate;
    console.log(
      `  ${id.padEnd(18)} pass ${Math.round(b.passRate * 100)}% → ${Math.round(s.passRate * 100)}%${delta ? (delta > 0 ? '  ▲' : '  ▼') : ''}  credits ${avg(b.credits.filter(Number.isFinite)).toFixed(0)} → ${avg(s.credits.filter(Number.isFinite)).toFixed(0)}`
    );
  }
}
if (outPath) {
  fs.writeFileSync(
    outPath,
    JSON.stringify({ summary, results }, null, 1) + '\n'
  );
  console.log(`\nWrote ${outPath}`);
}
