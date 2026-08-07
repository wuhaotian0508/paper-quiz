-- Review sheets moved from a flat topic list to numbered two-column sections. The
-- share RPC only projected `topics`, so newly published sheets came back empty.

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
    'expiresAt', review.expires_at
  )
  from public.paper_quiz_shared_review_sheets review
  where review.slug = p_slug
    and review.is_active = true
    and (review.expires_at is null or review.expires_at > now());
$$;

revoke all on function public.get_shared_review_sheet(text) from public;
grant execute on function public.get_shared_review_sheet(text) to anon, authenticated;
