-- A shared review sheet rendered as a title with nothing under it, signed in or not.
--
-- Two projection gaps in `get_shared_review_sheet`, both invisible to the component tests
-- because those feed the view a mocked RPC result that already contains every field:
--
--   1. `sections`. Sheets are generated as numbered two-column sections and explicitly set
--      `topics` to null (see lib/exam-review.ts), so a sheet whose `sections` never leave the
--      database arrives with an empty body. 20260806000001 fixed this; re-asserting it here is
--      idempotent and covers the case where that migration was never applied to a project.
--   2. `sourcePages`. `buildSharedReview` stores the selected page previews in the row, but no
--      version of this function has ever projected them, so the "Source pages" strip on a
--      shared link has always been empty.
--
-- Reading stays public and bounded: the row's original PDF and private answer records are not
-- in this projection, which is what the share note on the page promises.

create or replace function public.get_shared_review_sheet(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', review.slug,
    'title', review.title,
    'subject', review.review->>'subject',
    'scope', review.review->>'scope',
    'goal', review.review->>'goal',
    'sections', review.review->'sections',
    'topics', review.review->'topics',
    'sourcePages', review.review->'sourcePages',
    'expiresAt', review.expires_at
  )
  from public.paper_quiz_shared_review_sheets review
  where review.slug = p_slug
    and review.is_active = true
    and (review.expires_at is null or review.expires_at > now());
$$;

-- `create or replace` keeps the existing ACL, so this only re-asserts it. The grant to PUBLIC
-- is the one 20260805 had to add: PostgREST's API roles inherit from PUBLIC, and the original
-- migration's `revoke all ... from public` was what took the share links down in production.
grant execute on function public.get_shared_review_sheet(text) to public;
grant execute on function public.get_shared_review_sheet(text) to anon, authenticated;
-- PostgREST caches function signatures; without this the replaced body is not picked up.
notify pgrst, 'reload schema';
