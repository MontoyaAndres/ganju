import type { ProjectDatabase } from './projectDatabase';

export interface Env {
  PROJECT_DATABASE: DurableObjectNamespace<ProjectDatabase>;
  // Exports are written here, under data-exports/<artifactId>/<exportId>/.
  STORAGE_BUCKET: R2Bucket;
  // Trigger events, handed over from each database's outbox by its alarm.
  // Absent in tests: events then stay in the outbox.
  DATA_TRIGGER_QUEUE?: Queue;
}
