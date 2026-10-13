const PAGE_SIZE = 1000;

// Supabase/PostgREST caps a single request at 1000 rows by default — silently, with no error,
// just fewer rows than actually exist. Any query whose result could realistically exceed that
// (a course's full question list, or all of its questions' options) needs this instead of a bare
// .select(), or large courses quietly lose data client-side with nothing in the UI or console
// hinting why. Confirmed live: a 932-question course needing ~4,600 option rows only ever
// received the first 1000, so most of its questions rendered with zero answer choices.
//
// Keyset pagination (WHERE id > lastSeenId ORDER BY id LIMIT N), not OFFSET — OFFSET makes
// Postgres walk and discard every earlier row on every page request, which gets slower (and can
// hit a statement timeout) the deeper it goes on a large table. Keyset resumes directly from the
// primary key index at the last row already read, so every page costs the same regardless of how
// many came before it. `buildQuery` must select "id" even if the caller doesn't otherwise need
// it, and any caller-visible ordering (e.g. a question's sort_order) should be applied by the
// caller after all pages are collected, not relied on here — this only orders by id, to paginate.
export async function fetchAllRows<T extends { id: string }>(
  buildQuery: (
    after: string | null,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let lastId: string | null = null;
  for (;;) {
    const { data, error } = await buildQuery(lastId);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    lastId = page[page.length - 1].id;
  }
  return rows;
}

export { PAGE_SIZE as SUPABASE_PAGE_SIZE };
