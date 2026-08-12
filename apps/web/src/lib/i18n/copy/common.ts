import type { Catalog } from '../core';

/**
 * Strings that belong to no single view — button verbs, the generic failure
 * line, the two states every save button has. Anything that reads differently
 * depending on what it acts on belongs in that view's catalog instead.
 *
 * English is declared first and its shape types every other language, so a key
 * added here fails the build until it is translated.
 */
const en = {
  cancel: 'Cancel',
  close: 'Close',
  save: 'Save',
  saving: 'Saving...',
  create: 'Create',
  creating: 'Creating...',
  /** The `UI.Alert` confirm button while its destructive action runs. */
  deleting: 'Deleting...',
  somethingWentWrong: 'Something went wrong. Please try again.',
  language: 'Language',
  /** What `t.relative()` renders when there is no date yet. */
  never: 'Never',
  /** Screen-reader name for the close button on a toast. */
  dismiss: 'Dismiss',

  /** `pages/404.tsx` and `pages/500.tsx`, which replace Next's English ones. */
  notFoundTitle: 'Page not found',
  notFoundText:
    'The page you are looking for was moved, or never existed in the first place.',
  serverErrorTitle: 'Something broke on our side',
  serverErrorText:
    'The page could not be loaded. Try again in a moment — if it keeps happening, write to us.',
  backHome: 'Back home',

  /**
   * The default document title and description, in `_app.tsx`. Every page is
   * `noindex`, so this is not an SEO concern — it is the browser tab, and the
   * text a bookmark or a shared link preview picks up.
   */
  appDescription:
    'Ganju dashboard — manage your projects, tools, resources, and channels.',

  /**
   * The language switch offered by pages that render no layout — sign-in and
   * the invitation page. Written in the *other* language, so it reads to the
   * person who needs it: the English page offers Spanish, and vice versa.
   */
  switchPrompt: '¿Prefieres español?',
  switchAction: 'Cambiar a español'
};

type CommonCopy = typeof en;

export const COMMON: Catalog<CommonCopy> = {
  en,
  es: {
    cancel: 'Cancelar',
    close: 'Cerrar',
    save: 'Guardar',
    saving: 'Guardando...',
    create: 'Crear',
    creating: 'Creando...',
    deleting: 'Eliminando...',
    somethingWentWrong: 'Algo salió mal. Inténtalo de nuevo.',
    language: 'Idioma',
    never: 'Nunca',
    dismiss: 'Descartar',

    notFoundTitle: 'No encontramos esta página',
    notFoundText: 'La página que buscas cambió de lugar, o nunca existió.',
    serverErrorTitle: 'Algo falló de nuestro lado',
    serverErrorText:
      'No pudimos cargar la página. Inténtalo de nuevo en un momento — si sigue pasando, escríbenos.',
    backHome: 'Volver al inicio',

    appDescription:
      'Panel de Ganju — gestiona tus proyectos, herramientas, recursos y canales.',

    switchPrompt: 'Prefer English?',
    switchAction: 'Switch to English'
  }
};
