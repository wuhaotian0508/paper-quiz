-- The initial shared-review migration was applied before PostgREST refreshed its schema cache
-- in production. Re-assert the concrete overload privileges and ask PostgREST to reload them.
grant usage on schema public to anon, authenticated;
-- Both functions validate auth.uid()/expiry internally. Granting to PUBLIC is
-- intentional here because PostgREST's API roles inherit from PUBLIC and the
-- initial migration revoked that base privilege.
grant execute on function public.create_shared_review_sheet(text, jsonb, timestamptz) to public;
grant execute on function public.get_shared_review_sheet(text) to public;

notify pgrst, 'reload schema';
