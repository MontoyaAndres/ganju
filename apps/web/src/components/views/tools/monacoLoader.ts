import { loader } from '@monaco-editor/react';

// Monaco is served from this origin, copied out of node_modules by
// scripts/copy-monaco.mjs — the default is a CDN; see that script for why it
// isn't. Configured in its own module because both editor surfaces need it and
// the call has to happen before whichever of them mounts first.
loader.config({ paths: { vs: '/monaco/vs' } });
