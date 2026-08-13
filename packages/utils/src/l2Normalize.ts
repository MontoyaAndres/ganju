// Scale a vector to unit length.
//
// Needed because `gemini-embedding-001` only returns a normalised vector at its
// full 3072 dimensions. Ask for fewer via `outputDimensionality` — as we do, to
// halve storage — and the values come back UNNORMALISED, because truncating a
// unit vector leaves it shorter than 1. Cosine distance in pgvector assumes
// nothing about magnitude, but our stored vectors and query vectors have to be
// treated identically, and an unnormalised mix silently skews ranking rather
// than failing. So both the ingest path and the query path normalise here.
//
// Returns the input unchanged when the magnitude is zero, which would otherwise
// divide by zero and produce NaNs that poison the whole index.
export const l2Normalize = (values: number[]): number[] => {
  let sum = 0;
  for (const v of values) sum += v * v;
  const magnitude = Math.sqrt(sum);
  if (!magnitude || !Number.isFinite(magnitude)) return values;
  return values.map(v => v / magnitude);
};
