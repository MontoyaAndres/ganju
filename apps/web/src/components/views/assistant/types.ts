export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ActionEffect {
  name: string;
  changesThings: boolean;
  onlyReads: boolean;
  data: { access?: string; tables?: string[] } | null;
}

export interface ChangeSetCard {
  kind: 'change_set';
  changeSetId: string;
  summary: string | null;
  items: {
    label: string;
    undoable: boolean;
    effects: {
      actions: ActionEffect[];
      hosts: string[];
      accounts: string[];
    } | null;
  }[];
}

export interface PatchCard {
  kind: 'patch';
  versionId: string;
  note: string | null;
  files: string[];
  patch: string;
}

export interface OwnerCard {
  kind: 'connect_account' | 'secret' | 'upload';
  provider: string | null;
  label: string | null;
  message: string;
}

export type Card = ChangeSetCard | PatchCard | OwnerCard;

export interface Message {
  id: string;
  turnId: string;
  seq: number;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  cards: Card[] | null;
  credits: number;
  createdAt: string;
}

export interface ChangeSet {
  id: string;
  status: 'proposed' | 'applied' | 'failed' | 'undone' | 'discarded';
  error: string | null;
}

export interface Conversation {
  id: string;
  title: string | null;
  status: 'idle' | 'running';
  lastMessageAt: string | null;
}

export interface ConversationDetail {
  conversation: Conversation;
  credits: number;
  messages: Message[];
  changeSets: ChangeSet[];
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; action: string | null }
  | { type: 'card'; card: Card }
  | { type: 'usage'; credits: number }
  | { type: 'error'; message: string }
  | { type: 'done'; stoppedBy: string; credits: number };

// What the page shows, built from saved messages plus the live turn.
export type Entry =
  | { kind: 'owner'; key: string; text: string }
  | { kind: 'note'; key: string; text: string }
  | { kind: 'reply'; key: string; text: string; credits: number }
  | { kind: 'card'; key: string; card: Card };

export interface TryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | null;
}

export interface TryReply {
  capped: boolean;
  text: string;
  sourcesFooter: string | null;
  files: string[];
  buttons: { yes: string; no: string } | null;
}
