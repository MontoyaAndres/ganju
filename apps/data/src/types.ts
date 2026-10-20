import type { ProjectDatabase } from './projectDatabase';

export interface Env {
  PROJECT_DATABASE: DurableObjectNamespace<ProjectDatabase>;
  // Exports are written here, under data-exports/<artifactId>/<exportId>/.
  STORAGE_BUCKET: R2Bucket;
}
