// The tail of the previous chunk a chunk opens with, so a sentence cut at the
// boundary still reads whole on one side of it. `overlap` of zero (or less)
// borrows nothing — `slice(-0)` is `slice(0)`, the whole previous chunk, which
// would double every chunk's text.
export const overlapTail = (previous: string, overlap: number): string =>
  overlap > 0 ? previous.slice(-overlap) : '';
