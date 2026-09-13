-- Drop the leftover book-catalog functions.
--
-- The hosted project this repo points at was previously used by an unrelated library
-- catalog app. Its tables are already gone, but nine functions survived in `public`
-- with no caller and no dependent object: `pg_trigger` holds only this project's own
-- `on_auth_user_created`, and `fn_set_updated_at` is attached to nothing.
--
-- They are not dead weight only. `public` is the schema PostgREST publishes, so each
-- one was a live `/rest/v1/rpc/<name>` URL reachable with the publishable key that
-- ships inside the app bundle. Three were `security definer` with `execute` still
-- granted to `anon`:
--
--   * `verify_user_password` (both overloads) answered password guesses without a
--     session — an unauthenticated credential-testing endpoint.
--   * `insert_book_encrypted` wrote rows as the owner.
--
-- None of the nine pinned `search_path`, so an unqualified name in the body resolved
-- against the caller's — the escalation CLAUDE.md section 6.2 rule 2 describes.
--
-- `if exists` because a clone pointed at a fresh Supabase project never had these,
-- and `supabase db push` has to succeed there too. No `cascade`: if some object does
-- turn out to depend on one of these, this migration should fail loudly rather than
-- take that object with it.
--
-- No revert file (docs/migrations.md rule 2): the bodies of what this drops are not in
-- the repo, and restoring them would reopen the endpoints described above.
-- no-revert: drop-only; its revert would restore leftover functions from an unrelated project

drop function if exists public.verify_user_password(p_email text, p_password text, p_enc_key text);
drop function if exists public.verify_user_password(p_email_fingerprint text, p_password text);
drop function if exists public.insert_book_encrypted(
  p_enc_key text, p_title text, p_responsibility text, p_variant_title text,
  p_parallel_title text, p_main_creator text, p_contributors text, p_corporate text,
  p_place_of_publication text, p_publisher text, p_date_of_publication text,
  p_extent_of_text text, p_edition text, p_illustration text, p_series text,
  p_isbn text, p_subject_typical text, p_subject_personal text,
  p_call_number_prefix text, p_call_number text, p_material_types text[],
  p_accession text, p_language text, p_library_location text,
  p_electronic_access text, p_cover_image_file text, p_vol_copy integer,
  p_entered_by text, p_date_entered date, p_update_date date, p_vocabulary text,
  p_localization text, p_collection_types text[]
);
drop function if exists public.encrypt_field(plaintext text, enc_key text);
drop function if exists public.decrypt_field(ciphertext bytea, enc_key text);
drop function if exists public.hash_password(plain text);
drop function if exists public.verify_password(plain text, stored_hash text);
drop function if exists public.sha256_hex(val text);
drop function if exists public.fn_set_updated_at();
