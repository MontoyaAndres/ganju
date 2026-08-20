import type { Catalog } from '../core';

/**
 * The resources view — files, pasted text, crawled websites, and folders synced
 * from Google Drive or OneDrive.
 *
 * `MIME`, `URI`, `URL` and the encoding and mime-type option values are format
 * names that appear verbatim in the payload and stay as they are. So do the
 * audience roles, which come from `utils.constants.ROLE_MESSAGES`.
 *
 * The last block feeds `packages/ui` components through their props — the
 * defaults there are English, and this is where a translation reaches them.
 */
const en = {
  title: 'Resources',
  subtitle: 'Static files and templates this MCP server can serve to clients.',
  search: 'Search',
  addFiles: 'Add files',
  addWebsite: 'Add website',
  addFromGoogleDrive: 'Add from Google Drive',
  addFromOneDrive: 'Add from OneDrive',
  loading: 'Loading…',
  sync: 'Sync',
  syncing: 'Syncing…',
  deleteFolder: 'Delete folder',
  viewSources: 'Sources',
  viewAll: 'All resources',
  back: 'Back',

  // Folder names, also used as the section headings.
  folderMine: 'My folder',
  folderWebsites: 'Websites',
  folderGoogleDrive: 'Google Drive',
  folderOneDrive: 'OneDrive',
  badgeWebsite: 'Website',

  /**
   * Folder counts. Plurals, not `n + ' item' + (n === 1 ? '' : 's')` — Spanish
   * agreement does not come from appending a letter.
   */
  countItems_one: '{count} item',
  countItems_other: '{count} items',
  countDocuments_one: '{count} document',
  countDocuments_other: '{count} documents',
  countWebsites_one: '{count} website',
  countWebsites_other: '{count} websites',
  countPages_one: '{count} page',
  countPages_other: '{count} pages',

  // Empty states, one per folder.
  folderEmpty: 'This folder is empty',
  emptyAll: 'No resources yet',
  emptyWebsites: 'No websites yet',
  emptyGdrive: 'No Google Drive items yet',
  emptyOnedrive: 'No OneDrive items yet',
  emptyFiles: 'No files yet',
  emptyWebsitesText: 'Add a URL to crawl and index its pages.',
  emptyGdriveText:
    'Pick files or folders from Google Drive to import and keep in sync.',
  emptyOnedriveText:
    'Pick files or folders from OneDrive to import and keep in sync.',
  emptyFilesText:
    'Upload files or paste text content for this MCP server to serve.',

  // Panel titles.
  panelAddWebsite: 'Add Website',
  panelNewResource: 'New Resource',
  panelEditResource: 'Edit Resource',

  // Website form.
  websiteUrl: 'URL',
  websiteUrlPlaceholder: 'https://example.com',
  websiteUrlHelp: 'The starting URL. Same-origin links are followed.',
  websiteTitle: 'Title',
  websiteTitlePlaceholder: 'A name for this website',
  websiteDescription: 'Description',
  websiteDescriptionPlaceholder: 'What is on this site?',
  maxPages: 'Max pages',
  maxDepth: 'Max depth',

  // Resource form.
  resourceTitle: 'Title',
  resourceTitlePlaceholder: 'e.g. System Instructions',
  resourceTitleHelp: 'A human-readable name for this resource',
  uri: 'URI',
  uriPlaceholder: 'resource://my-resource',
  uriHelp: 'Auto-generated from title. Edit to customize.',
  type: 'Type',
  typeStaticHelp: "Fixed content that doesn't change",
  typeTemplateHelp: 'Dynamic content with variables (e.g. {userId})',
  typeStatic: 'Static — Fixed content',
  typeTemplate: 'Template — Dynamic with variables',
  description: 'Description',
  descriptionPlaceholder: 'What is this resource about?',
  contentSource: 'Content source',
  contentSourceFile: 'File',
  contentSourceText: 'Text',
  mimeType: 'MIME Type',
  encoding: 'Encoding',
  content: 'Content',
  sizeHint: 'Size: {size}',
  fileSelect: 'Click to select a file',
  fileReplace: 'Click to replace file',
  fileUnknownType: 'unknown',

  advancedOptions: 'Advanced options',
  audience: 'Audience',
  priority: 'Priority (0 to 1)',
  icons: 'Icons',
  iconUrl: 'URL',
  iconTheme: 'Theme',
  iconThemeNone: 'None',
  iconsEmpty: 'No icons added yet.',

  /**
   * Values the API sends, rendered as badges in the view pane. The wire keeps
   * `FILE` / `GOOGLE_DRIVE_FOLDER` / `static`; only the badge is translated.
   */
  sourceTypeFile: 'File',
  sourceTypeWebsite: 'Website',
  sourceTypeGoogleDrive: 'Google Drive',
  sourceTypeOneDrive: 'OneDrive',
  sourceTypeCustomCode: 'Tool',
  typeStaticBadge: 'Static',
  typeTemplateBadge: 'Template',

  // View pane.
  infoSource: 'Source',
  infoType: 'Type',
  infoMimeType: 'MIME Type',
  infoSize: 'Size',
  infoEncoding: 'Encoding',
  infoFileName: 'File name',
  sectionUri: 'URI',
  sectionSources: 'Sources',
  sourcesOn: 'Cite this resource in replies',
  sourcesOff: 'Hidden from citations',
  sourcesHint:
    'When enabled, the agent will reference this resource as a source in answers that use it.',
  sectionDescription: 'Description',
  sectionFile: 'File',
  openFile: 'Open file',
  sectionContent: 'Content',
  /** `{count}` characters — the collapsed preview of a long body. */
  showContent: 'Show content ({count} chars)',
  hideContent: 'Hide content',
  /** Two JSON blocks in the view pane, each collapsible past ~600 characters. */
  sectionMetadata: 'Metadata',
  sectionAnnotations: 'Annotations',
  showMetadata: 'Show metadata ({count} chars)',
  hideMetadata: 'Hide metadata',
  showAnnotations: 'Show annotations ({count} chars)',
  hideAnnotations: 'Hide annotations',

  // Import modals.
  importGoogleDrive: 'Import from Google Drive',
  importOneDrive: 'Import from OneDrive',
  importing: 'Importing…',
  addSelected: 'Add selected',
  addSelectedCount: 'Add selected ({count})',

  confirmDeleteTitle: 'Delete resource',
  confirmDeleteText:
    'Are you sure you want to delete "{title}"? This action cannot be undone.',
  confirmDeleteFolder_one:
    'Are you sure you want to delete "{title}"? This will also remove {count} item inside. This action cannot be undone.',
  confirmDeleteFolder_other:
    'Are you sure you want to delete "{title}"? This will also remove {count} items inside. This action cannot be undone.',
  confirmDelete: 'Delete',

  startCrawl: 'Start crawl',
  startingCrawl: 'Starting crawl...',

  /**
   * Checked in the browser before the upload leaves, so these never reach the
   * API and never pass through `localizeZodIssue`.
   */
  errorFileTooLarge: 'File size exceeds the {size}MB limit',
  errorFileType: 'Unsupported mime type: {type}',
  errorUploadFailed: 'Upload failed ({status})',

  // Feedback.
  toastCrawlStarted: 'Crawl started',
  toastCreated: 'Resource created',
  toastCreateFailed: 'Failed to create resource',
  toastSourcesEnabled: 'Sources enabled',
  toastSourcesHidden: 'Sources hidden',
  toastSourcesFailed: 'Failed to update source visibility',
  toastUpdated: 'Resource updated',
  toastUpdateFailed: 'Failed to update resource',
  toastDeleted: 'Resource deleted',
  toastDeleteFailed: 'Failed to delete resource',
  toastFilePreviewFailed: 'Failed to load file preview',
  toastGdriveConnectFailed: 'Unable to start Google Drive connection',
  toastGdriveOpenFailed: 'Failed to open Google Drive',
  toastGdriveImportFailed: 'Failed to import from Google Drive',
  toastGdriveConnectToImport: 'Connect Google Drive to import files',
  toastGdriveConnectToSync: 'Connect Google Drive to sync files',
  toastOnedriveConnectFailed: 'Unable to start OneDrive connection',
  toastOnedriveOpenFailed: 'Failed to open OneDrive',
  toastOnedriveImportFailed: 'Failed to import from OneDrive',
  toastOnedriveConnectToImport: 'Connect OneDrive to import files',
  toastOnedriveConnectToSync: 'Connect OneDrive to sync files',
  toastNothingToSync: 'Nothing to sync',
  toastSyncStarted: 'Sync started',
  toastImportingGdrive_one: 'Importing {count} item from Google Drive',
  toastImportingGdrive_other: 'Importing {count} items from Google Drive',
  toastImportingOnedrive_one: 'Importing {count} item from OneDrive',
  toastImportingOnedrive_other: 'Importing {count} items from OneDrive',
  toastSyncFailed_one: 'Sync failed for {count} item',
  toastSyncFailed_other: 'Sync failed for {count} items',

  /** Passed into `packages/ui`, whose own defaults are English. */
  uiIndexing: 'Indexing',
  uiReady: 'Ready',
  uiFailed: 'Failed',
  uiDriveEmpty: 'No files in this folder',
  uiDriveSessionExpired: 'Session expired. Please reconnect and try again.',
  uiDriveLoadError: 'Failed to load',
  uiDriveSearch: 'Search across this tab',
  uiDriveClearSearch: 'Clear search',
  uiDriveClearAll: 'Clear all',
  uiDriveFolder: 'Folder',
  uiDriveFile: 'File',
  uiDriveRemove: 'Remove {name}',
  uiDriveAlreadyIncluded: 'Already included via "{name}"',
  uiDriveSelected_one: '{count} selected',
  uiDriveSelected_other: '{count} selected',
  /**
   * The drive's own tabs. Google and Microsoft translate these in their
   * consoles, so unlike the third-party labels elsewhere in the dashboard these
   * do get translated — and to the wording each product uses in Spanish.
   */
  uiDriveTabMyDrive: 'My Drive',
  uiDriveTabSharedWithMe: 'Shared with me',
  uiDriveTabSharedDrives: 'Shared drives',
  uiDriveTabStarred: 'Starred',
  uiDriveTabMyFiles: 'My files',
  uiDriveTabRecent: 'Recent',
  uiDriveTabDrives: 'Drives'
};

type ResourcesCopy = typeof en;

export const RESOURCES: Catalog<ResourcesCopy> = {
  en,
  es: {
    title: 'Recursos',
    subtitle:
      'Archivos y plantillas estáticos que este servidor MCP puede entregar a sus clientes.',
    search: 'Buscar',
    addFiles: 'Agregar archivos',
    addWebsite: 'Agregar sitio web',
    addFromGoogleDrive: 'Agregar desde Google Drive',
    addFromOneDrive: 'Agregar desde OneDrive',
    loading: 'Cargando…',
    sync: 'Sincronizar',
    syncing: 'Sincronizando…',
    deleteFolder: 'Eliminar la carpeta',
    viewSources: 'Fuentes',
    viewAll: 'Todos los recursos',
    back: 'Volver',

    folderMine: 'Mi carpeta',
    folderWebsites: 'Sitios web',
    folderGoogleDrive: 'Google Drive',
    folderOneDrive: 'OneDrive',
    badgeWebsite: 'Sitio web',

    countItems_one: '{count} elemento',
    countItems_other: '{count} elementos',
    countDocuments_one: '{count} documento',
    countDocuments_other: '{count} documentos',
    countWebsites_one: '{count} sitio web',
    countWebsites_other: '{count} sitios web',
    countPages_one: '{count} página',
    countPages_other: '{count} páginas',

    folderEmpty: 'Esta carpeta está vacía',
    emptyAll: 'Todavía no hay recursos',
    emptyWebsites: 'Todavía no hay sitios web',
    emptyGdrive: 'Todavía no hay elementos de Google Drive',
    emptyOnedrive: 'Todavía no hay elementos de OneDrive',
    emptyFiles: 'Todavía no hay archivos',
    emptyWebsitesText: 'Agrega una URL para rastrearla e indexar sus páginas.',
    emptyGdriveText:
      'Elige archivos o carpetas de Google Drive para importarlos y mantenerlos sincronizados.',
    emptyOnedriveText:
      'Elige archivos o carpetas de OneDrive para importarlos y mantenerlos sincronizados.',
    emptyFilesText:
      'Sube archivos o pega texto para que este servidor MCP los entregue.',

    panelAddWebsite: 'Agregar sitio web',
    panelNewResource: 'Nuevo recurso',
    panelEditResource: 'Editar recurso',

    websiteUrl: 'URL',
    websiteUrlPlaceholder: 'https://ejemplo.com',
    websiteUrlHelp: 'La URL de inicio. Seguimos los enlaces del mismo dominio.',
    websiteTitle: 'Título',
    websiteTitlePlaceholder: 'Un nombre para este sitio',
    websiteDescription: 'Descripción',
    websiteDescriptionPlaceholder: '¿Qué hay en este sitio?',
    maxPages: 'Máximo de páginas',
    maxDepth: 'Profundidad máxima',

    resourceTitle: 'Título',
    resourceTitlePlaceholder: 'ej. Instrucciones del sistema',
    resourceTitleHelp: 'Un nombre legible para este recurso',
    uri: 'URI',
    uriPlaceholder: 'resource://mi-recurso',
    uriHelp: 'Se genera a partir del título. Edítala si quieres cambiarla.',
    type: 'Tipo',
    typeStaticHelp: 'Contenido fijo que no cambia',
    typeTemplateHelp: 'Contenido dinámico con variables (ej. {userId})',
    typeStatic: 'Estático — contenido fijo',
    typeTemplate: 'Plantilla — dinámico con variables',
    description: 'Descripción',
    descriptionPlaceholder: '¿De qué trata este recurso?',
    contentSource: 'Origen del contenido',
    contentSourceFile: 'Archivo',
    contentSourceText: 'Texto',
    mimeType: 'Archivo',
    encoding: 'Codificación',
    content: 'Contenido',
    sizeHint: 'Tamaño: {size}',
    fileSelect: 'Haz clic para elegir un archivo',
    fileReplace: 'Haz clic para reemplazar el archivo',
    fileUnknownType: 'desconocido',

    advancedOptions: 'Opciones avanzadas',
    audience: 'Audiencia',
    priority: 'Prioridad (0 a 1)',
    icons: 'Iconos',
    iconUrl: 'URL',
    iconTheme: 'Tema',
    iconThemeNone: 'Ninguno',
    iconsEmpty: 'Todavía no hay iconos.',

    sourceTypeFile: 'Archivo',
    sourceTypeWebsite: 'Sitio web',
    sourceTypeGoogleDrive: 'Google Drive',
    sourceTypeOneDrive: 'OneDrive',
    sourceTypeCustomCode: 'Herramienta',
    typeStaticBadge: 'Estático',
    typeTemplateBadge: 'Plantilla',

    infoSource: 'Origen',
    infoType: 'Tipo',
    infoMimeType: 'Archivo',
    infoSize: 'Tamaño',
    infoEncoding: 'Codificación',
    infoFileName: 'Nombre del archivo',
    sectionUri: 'URI',
    sectionSources: 'Fuentes',
    sourcesOn: 'Citar este recurso en las respuestas',
    sourcesOff: 'Oculto en las citas',
    sourcesHint:
      'Cuando está activado, el agente cita este recurso como fuente en las respuestas que lo usan.',
    sectionDescription: 'Descripción',
    sectionFile: 'Archivo',
    openFile: 'Abrir el archivo',
    sectionContent: 'Contenido',
    showContent: 'Ver el contenido ({count} caracteres)',
    hideContent: 'Ocultar el contenido',
    sectionMetadata: 'Metadatos',
    sectionAnnotations: 'Anotaciones',
    showMetadata: 'Ver los metadatos ({count} caracteres)',
    hideMetadata: 'Ocultar los metadatos',
    showAnnotations: 'Ver las anotaciones ({count} caracteres)',
    hideAnnotations: 'Ocultar las anotaciones',

    importGoogleDrive: 'Importar desde Google Drive',
    importOneDrive: 'Importar desde OneDrive',
    importing: 'Importando…',
    addSelected: 'Agregar lo seleccionado',
    addSelectedCount: 'Agregar lo seleccionado ({count})',

    confirmDeleteTitle: 'Eliminar recurso',
    confirmDeleteText:
      '¿Seguro que quieres eliminar «{title}»? Esta acción no se puede deshacer.',
    confirmDeleteFolder_one:
      '¿Seguro que quieres eliminar «{title}»? También se eliminará {count} elemento que hay dentro. Esta acción no se puede deshacer.',
    confirmDeleteFolder_other:
      '¿Seguro que quieres eliminar «{title}»? También se eliminarán los {count} elementos que hay dentro. Esta acción no se puede deshacer.',
    confirmDelete: 'Eliminar',

    startCrawl: 'Iniciar rastreo',
    startingCrawl: 'Iniciando rastreo...',

    errorFileTooLarge: 'El archivo supera el límite de {size} MB',
    errorFileType: 'Tipo de archivo no admitido: {type}',
    errorUploadFailed: 'No pudimos subir el archivo ({status})',

    toastCrawlStarted: 'Rastreo iniciado',
    toastCreated: 'Recurso creado',
    toastCreateFailed: 'No pudimos crear el recurso',
    toastSourcesEnabled: 'Fuentes activadas',
    toastSourcesHidden: 'Fuentes ocultas',
    toastSourcesFailed: 'No pudimos actualizar la visibilidad de las fuentes',
    toastUpdated: 'Recurso actualizado',
    toastUpdateFailed: 'No pudimos actualizar el recurso',
    toastDeleted: 'Recurso eliminado',
    toastDeleteFailed: 'No pudimos eliminar el recurso',
    toastFilePreviewFailed: 'No pudimos cargar la vista previa del archivo',
    toastGdriveConnectFailed: 'No pudimos iniciar la conexión con Google Drive',
    toastGdriveOpenFailed: 'No pudimos abrir Google Drive',
    toastGdriveImportFailed: 'No pudimos importar desde Google Drive',
    toastGdriveConnectToImport: 'Conecta Google Drive para importar archivos',
    toastGdriveConnectToSync:
      'Conecta Google Drive para sincronizar los archivos',
    toastOnedriveConnectFailed: 'No pudimos iniciar la conexión con OneDrive',
    toastOnedriveOpenFailed: 'No pudimos abrir OneDrive',
    toastOnedriveImportFailed: 'No pudimos importar desde OneDrive',
    toastOnedriveConnectToImport: 'Conecta OneDrive para importar archivos',
    toastOnedriveConnectToSync:
      'Conecta OneDrive para sincronizar los archivos',
    toastNothingToSync: 'No hay nada que sincronizar',
    toastSyncStarted: 'Sincronización iniciada',
    toastImportingGdrive_one: 'Importando {count} elemento de Google Drive',
    toastImportingGdrive_other: 'Importando {count} elementos de Google Drive',
    toastImportingOnedrive_one: 'Importando {count} elemento de OneDrive',
    toastImportingOnedrive_other: 'Importando {count} elementos de OneDrive',
    toastSyncFailed_one: 'Falló la sincronización de {count} elemento',
    toastSyncFailed_other: 'Falló la sincronización de {count} elementos',

    uiIndexing: 'Indexando',
    uiReady: 'Listo',
    uiFailed: 'Falló',
    uiDriveEmpty: 'No hay archivos en esta carpeta',
    uiDriveSessionExpired:
      'La sesión venció. Vuelve a conectarte e inténtalo de nuevo.',
    uiDriveLoadError: 'No pudimos cargar el contenido',
    uiDriveSearch: 'Busca en esta pestaña',
    uiDriveClearSearch: 'Borrar la búsqueda',
    uiDriveClearAll: 'Quitar todo',
    uiDriveFolder: 'Carpeta',
    uiDriveFile: 'Archivo',
    uiDriveRemove: 'Quitar {name}',
    uiDriveAlreadyIncluded: 'Ya está incluido dentro de «{name}»',
    uiDriveSelected_one: '{count} seleccionado',
    uiDriveSelected_other: '{count} seleccionados',

    uiDriveTabMyDrive: 'Mi unidad',
    uiDriveTabSharedWithMe: 'Compartido conmigo',
    uiDriveTabSharedDrives: 'Unidades compartidas',
    uiDriveTabStarred: 'Destacados',
    uiDriveTabMyFiles: 'Mis archivos',
    uiDriveTabRecent: 'Recientes',
    uiDriveTabDrives: 'Unidades'
  }
};
