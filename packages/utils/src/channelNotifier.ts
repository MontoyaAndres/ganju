import { constants } from './constants';

export interface ToolStatusEvent {
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ChannelNotifier {
  toolStarted: (event: ToolStatusEvent) => Promise<void>;
}

const TOOL_STATUS_COPY: Record<string, string> = {
  [constants.RESOURCE_TOOL_KEY_SEND_RESOURCE]: 'Preparing the file to send…',
  'gmail-send-email': 'Sending the email…',
  'gmail-reply-email': 'Sending the reply…',
  'gmail-forward-email': 'Forwarding the email…',
  'gmail-send-draft': 'Sending the draft…',
  'gmail-create-draft': 'Saving the draft…',
  'gmail-update-draft': 'Updating the draft…',
  'gmail-delete-draft': 'Deleting the draft…',
  'gmail-trash-email': 'Moving the email to trash…',
  'gmail-modify-labels': 'Updating email labels…',
  'gmail-batch-modify-labels': 'Updating email labels…',
  'outlook-send-email': 'Sending the email…',
  'outlook-reply-email': 'Sending the reply…',
  'outlook-forward-email': 'Forwarding the email…',
  'outlook-send-draft': 'Sending the draft…',
  'outlook-create-draft': 'Saving the draft…',
  'outlook-update-draft': 'Updating the draft…',
  'outlook-delete-draft': 'Deleting the draft…',
  'outlook-trash-email': 'Moving the email to trash…',
  'outlook-move-message': 'Moving the email…',
  'outlook-batch-move-messages': 'Moving the emails…'
};

export const getToolStatusMessage = (toolName: string): string | null =>
  TOOL_STATUS_COPY[toolName] ?? null;
