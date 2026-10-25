// Lets non-composer UI (OpenUI actions) place text into the chat input
// without sending it. The mounted composer listens for this event.
export const COMPOSER_FILL_EVENT = 'kendali:composer-fill';

export interface ComposerFillDetail {
  text: string;
}

export function fillComposer(text: string) {
  if (!text || !text.trim()) return;
  window.dispatchEvent(
    new CustomEvent<ComposerFillDetail>(COMPOSER_FILL_EVENT, { detail: { text } })
  );
}
