import { handleIndexBatch } from './indexResource';
import { handleCrawlDiscoverBatch } from './crawlDiscover';
import { handleCrawlPageBatch } from './crawlPage';
import { handleGdriveDiscoverBatch } from './gdriveDiscover';
import { handleGdriveFileBatch } from './gdriveFile';
import { handleOnedriveDiscoverBatch } from './onedriveDiscover';
import { handleOnedriveFileBatch } from './onedriveFile';
import { handleDataTriggerBatch } from './dataTrigger';

export {
  handleIndexBatch,
  handleCrawlDiscoverBatch,
  handleCrawlPageBatch,
  handleGdriveDiscoverBatch,
  handleGdriveFileBatch,
  handleOnedriveDiscoverBatch,
  handleOnedriveFileBatch,
  handleDataTriggerBatch
};

export type { IndexJob } from './indexResource';
export type { CrawlDiscoverJob } from './crawlDiscover';
export type { PageJob } from './crawlPage';
export type { GdriveDiscoverJob } from './gdriveDiscover';
export type { GdriveFileJob } from './gdriveFile';
export type { OnedriveDiscoverJob } from './onedriveDiscover';
export type { OnedriveFileJob } from './onedriveFile';
export type { DataTriggerJob } from './dataTrigger';
