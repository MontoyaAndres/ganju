import { constants } from './constants';

// Which of an artifact's resources are actually addressable.
//
// Two source types produce rows that exist to hold structure rather than
// content, and neither should ever be handed to a caller:
//
//  - a WEBSITE seed (the row with no parent) is the crawl's starting point. The
//    page at that URL is indexed separately as its child, so the seed and the
//    page carry the SAME uri while only the child has content.
//  - a Drive/OneDrive folder is a pure reference whose content lives in its
//    children.
//
// The seed case is why this has to be shared rather than reimplemented. Applied
// in one place and not another, a lookup by uri can return the seed in one code
// path and the page in another — the same uri on the same artifact answering
// "146 characters of text" and "no inline content and no file in storage"
// depending on which surface asked.
export interface ExposableResource {
  sourceType?: string | null;
  parentResourceId?: string | null;
}

export const isExposedResource = (resource: ExposableResource): boolean => {
  if (
    resource.sourceType === constants.RESOURCE_SOURCE_TYPE_WEBSITE &&
    !resource.parentResourceId
  ) {
    return false;
  }
  if (
    resource.sourceType === constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER
  ) {
    return false;
  }
  if (resource.sourceType === constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER) {
    return false;
  }
  return true;
};
