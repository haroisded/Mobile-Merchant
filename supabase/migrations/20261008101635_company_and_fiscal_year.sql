-- Step 1 of the POS foundation, on ERPNext's model: the Company and its Fiscal Year
-- (.claude/erpnext-docs/POS-System-Only-Features.md 1.1–1.2; docs.frappe.io/erpnext/company-setup and
-- /fiscal-year).
--
-- 1. countries and currency_presets: read-only reference data a Company is set up from. Seeded from
--    frappe's geo/country_info.json (MIT, (c) Frappe Technologies), the file ERPNext itself seeds its
--    Country and Currency records from. A currency several countries define differently takes its
--    issuing country's definition (USD from the United States), else the one most countries use.
-- 2. merchants becomes the Company: abbreviation, country, default currency. Multi-company is out of
--    scope, so a system IS its company, and there is no second tenant table
--    (.claude/instruction_mds/tenancy.md rule 5).
-- 3. fiscal_years.
-- 4. The seed trigger that gives every new system its first fiscal year, as ERPNext's setup wizard does.
--
-- Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;

-- The no-overlap constraint on fiscal_years compares a uuid with `=` inside a GiST index, which is what
-- btree_gist provides.
create extension if not exists btree_gist with schema extensions;


-- 1. Reference data. Readable by every signed-in user and written by nobody but a migration: RLS on,
-- with a select policy only (CLAUDE.md §6.1).

create table if not exists public.currency_presets (
  code text primary key,
  currency_name text not null,
  symbol text,
  -- The sub-unit's name for amounts in words ("Centavo"), and how many of it make one unit (100).
  fraction text,
  fraction_units integer,
  -- The smallest coin in circulation, for cash rounding. Null: round to the currency precision only.
  smallest_currency_fraction_value numeric,
  number_format text not null,

  constraint currency_presets_code_shape check (code ~ '^[A-Z]{3}$')
);

alter table public.currency_presets enable row level security;

drop policy if exists currency_presets_select on public.currency_presets;
create policy currency_presets_select on public.currency_presets
  for select to authenticated
  using (true);

create table if not exists public.countries (
  -- ISO 3166-1 alpha-2, upper case.
  code text primary key,
  country_name text not null unique,
  -- Null for the territories frappe's file gives no currency.
  currency_code text references public.currency_presets (code),
  -- IANA zones. The first is the one a new system's "today" is taken in.
  time_zones text[] not null default '{}',
  number_format text not null,

  constraint countries_code_shape check (code ~ '^[A-Z]{2}$')
);

alter table public.countries enable row level security;

drop policy if exists countries_select on public.countries;
create policy countries_select on public.countries
  for select to authenticated
  using (true);

insert into public.currency_presets
  (code, currency_name, symbol, fraction, fraction_units, smallest_currency_fraction_value, number_format)
values
  ('AED', 'UAE Dirham', 'د.إ', 'Fils', 100, null, '#,###.##'),
  ('AFN', 'AFN', '؋', 'Pul', 100, null, '#,###.##'),
  ('ALL', 'Lek', 'L', 'Qindarkë', 100, null, '#,###.##'),
  ('AMD', 'Armenian Dram', '֏', 'Luma', 100, null, '#,###.##'),
  ('AOA', 'Kwanza', 'AOA', 'Cêntimo', 100, null, '#,###.##'),
  ('ARS', 'Argentine Peso', '$', 'Centavo', 100, null, '#.###,##'),
  ('AUD', 'Australian Dollar', '$', 'Cent', 100, null, '# ###.##'),
  ('AWG', 'Aruban Florin', 'Afl', 'Cent', 100, null, '#,###.##'),
  ('BAM', 'BAM', 'KM', 'Fening', 100, null, '#.###,##'),
  ('BBD', 'Barbados Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('BDT', 'Taka', '৳', 'Paisa', 100, null, '#,###.##'),
  ('BHD', 'Bahraini Dinar', '.د.ب', 'Fils', 1000, null, '#,###.###'),
  ('BIF', 'Burundi Franc', 'Fr', null, 0, null, '#,###.##'),
  ('BMD', 'Bermudian Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('BND', 'Brunei Dollar', null, 'Sen', 100, null, '#,###.##'),
  ('BOB', 'Boliviano', null, 'Centavo', 100, null, '#,###.##'),
  ('BRL', 'BRL', 'R$', 'Centavo', 100, null, '#.###,##'),
  ('BSD', 'Bahamian Dollar', null, 'Cent', 100, null, '#,###.##'),
  ('BTN', 'Ngultrum', 'Nu.', 'Chetrum', 100, null, '#,###.##'),
  ('BWP', 'Pula', 'P', 'Thebe', 100, null, '#,###.##'),
  ('BZD', 'Belize Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('CAD', 'Canadian Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('CDF', 'Congolese franc', 'FC', 'Centime', 100, null, '#,###.##'),
  ('CHF', 'Swiss Franc', 'Fr', 'Rappen[K]', 100, 0.05, '#''###.##'),
  ('CLP', 'Chilean Peso', '$', null, 0, null, '#.###'),
  ('CNY', 'Yuan Renminbi', null, 'Fen', 100, 0.01, '#,###.##'),
  ('COP', 'Colombian Peso', '$', 'Centavo', 100, null, '#.###,##'),
  ('CRC', 'Costa Rican Colon', '₡', 'Céntimo', 100, null, '#.###,##'),
  ('CUP', 'Cuban Peso', '$', 'Centavo', 100, null, '#,###.##'),
  ('CVE', 'Cape Verde Escudo', 'Esc or $', 'Centavo', 100, null, '#,###.##'),
  ('CZK', 'Czech Koruna', 'Kč', 'Haléř', 100, null, '#.###,##'),
  ('DJF', 'Djibouti Franc', 'Fr', null, 0, null, '#,###.##'),
  ('DKK', 'Danish Krone', 'kr', 'Øre', 100, null, '#.###,##'),
  ('DOP', 'Dominican Peso', '$', 'Centavo', 100, null, '#,###.##'),
  ('DZD', 'Algerian Dinar', 'د.ج', 'Centime', 100, null, '#,###.##'),
  ('EGP', 'Egyptian Pound', '£ or ج.م', 'Piastre[F]', 100, null, '#,###.##'),
  ('ERN', 'Nakfa', 'Nfk', 'Cent', 100, null, '#,###.##'),
  ('ETB', 'Ethiopian Birr', 'Br', 'Santim', 100, null, '#,###.##'),
  ('EUR', 'Euro', '€', 'Cent', 100, 0.01, '#,###.##'),
  ('FJD', 'Fiji Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('FKP', 'Falkland Islands Pound', null, 'Penny', 100, null, '#,###.##'),
  ('GBP', 'Pound Sterling', '£', 'Penny', 100, null, '#,###.##'),
  ('GHS', 'GHS', '₵', 'Pesewa', 100, null, '#,###.##'),
  ('GIP', 'Gibraltar Pound', '£', 'Penny', 100, null, '#,###.##'),
  ('GMD', 'Dalasi', null, 'Butut', 100, null, '#,###.##'),
  ('GNF', 'Guinea Franc', 'Fr', null, 0, null, '#,###.##'),
  ('GTQ', 'Quetzal', 'Q', 'Centavo', 100, null, '#,###.##'),
  ('GYD', 'Guyana Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('HKD', 'Hong Kong Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('HNL', 'Lempira', 'L', 'Centavo', 100, null, '#,###.##'),
  ('HTG', 'Gourde', 'G', 'Centime', 100, null, '#,###.##'),
  ('HUF', 'Forint', 'Ft', 'Fillér', 100, null, '#.###'),
  ('IDR', 'Rupiah', 'Rp', 'Sen', 100, null, '#.###,##'),
  ('ILS', 'New Israeli Sheqel', '₪', 'Agora', 100, null, '#,###.##'),
  ('INR', 'Indian Rupee', '₹', 'Paisa', 100, null, '#,##,###.##'),
  ('IQD', 'Iraqi Dinar', 'ع.د', 'Fils', 1000, null, '#,###.###'),
  ('IRR', 'Iranian Rial', '﷼', 'Dinar', 100, null, '#,###.##'),
  ('ISK', 'Iceland Krona', 'kr', null, 0, null, '#.###'),
  ('JMD', 'Jamaican Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('JOD', 'Jordanian Dinar', 'د.ا', 'Fils', 1000, null, '#,###.###'),
  ('JPY', 'Yen', '¥', null, 0, null, '#,###'),
  ('KES', 'Kenyan Shilling', 'Sh', 'Cent', 100, null, '#,###.##'),
  ('KGS', 'Som', 'лв', 'Tyiyn', 100, null, '#,###.##'),
  ('KHR', 'Riel', '៛', 'Sen', 100, null, '#,###.##'),
  ('KMF', 'Comoro Franc', 'Fr', null, 0, null, '#,###.##'),
  ('KPW', 'North Korean Won', null, 'Chon', 100, null, '#,###.##'),
  ('KRW', 'Won', null, null, 0, null, '#,###'),
  ('KWD', 'Kuwaiti Dinar', 'د.ك', 'Fils', 1000, null, '#,###.###'),
  ('KYD', 'Cayman Islands Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('KZT', 'Tenge', '₸', 'Tïın', 100, null, '#,###.##'),
  ('LAK', 'Kip', null, 'Att', 100, null, '#,###.##'),
  ('LBP', 'Lebanese Pound', 'ل.ل', 'Piastre', 100, null, '#,###.##'),
  ('LKR', 'Sri Lanka Rupee', 'Rs', 'Cent', 100, null, '#,###.##'),
  ('LRD', 'Liberian Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('LSL', 'Loti', 'L', 'Sente', 100, null, '#,###.##'),
  ('LYD', 'Libyan Dinar', 'ل.د', 'Dirham', 1000, null, '#,###.###'),
  ('MAD', 'Moroccan Dirham', 'د.م.', 'Centime', 100, null, '#,###.##'),
  ('MDL', 'Moldovan Leu', null, 'Ban', 100, null, '#,###.##'),
  ('MKD', 'Denar', 'ден', 'Deni', 100, null, '#,###.##'),
  ('MMK', 'Kyat', null, 'Pya', 100, null, '#,###.##'),
  ('MNT', 'Tugrik', '₮', 'Möngö', 100, null, '#,###.##'),
  ('MOP', 'Pataca', null, 'Avo', 100, null, '#,###.##'),
  ('MRO', 'Ouguiya', 'UM', 'Khoums', 5, null, '#,###.##'),
  ('MUR', 'Mauritius Rupee', '₨', 'Cent', 100, null, '#,###'),
  ('MVR', 'Rufiyaa', '.ރ', 'Laari', 100, null, '#,###.##'),
  ('MWK', 'Kwacha', 'MK', 'Tambala', 100, null, '#,###.##'),
  ('MXN', 'Mexican Peso', '$', 'Centavo', 100, null, '#,###.##'),
  ('MYR', 'Malaysian Ringgit', 'RM', 'Sen', 100, null, '#,###.##'),
  ('MZN', 'MZN', 'MZN', 'Centavo', 100, null, '#,###.##'),
  ('NAD', 'Namibia Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('NGN', 'Naira', '₦', 'Kobo', 100, null, '#,###.##'),
  ('NIO', 'Cordoba Oro', 'C$', 'Centavo', 100, null, '#,###.##'),
  ('NOK', 'Norwegian Krone', 'kr', 'Øre', 100, null, '#.###,##'),
  ('NPR', 'Nepalese Rupee', '₨', 'Paisa', 100, null, '#,##,###.##'),
  ('NZD', 'New Zealand Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('OMR', 'Rial Omani', 'ر.ع.', 'Baisa', 1000, null, '#,###.###'),
  ('PEN', 'Nuevo Sol', 'S/.', 'Céntimo', 100, null, '#,###.##'),
  ('PGK', 'Kina', 'K', 'Toea', 100, null, '#,###.##'),
  ('PHP', 'Philippine Peso', '₱', 'Centavo', 100, null, '#,###.##'),
  ('PKR', 'Pakistan Rupee', '₨', 'Paisa', 100, null, '#,###.##'),
  ('PLN', 'PLN', 'zł', 'Grosz', 100, null, '#.###,##'),
  ('PYG', 'Guarani', '₲', null, 0, null, '#,###.##'),
  ('QAR', 'Qatari Rial', 'ر.ق', 'Dirham', 100, null, '#,###.##'),
  ('RON', 'Romanian New Leu', 'lei', 'Bani', 100, null, '#,###.##'),
  ('RSD', 'Serbian Dinar', 'дин.', 'Para', 100, null, '#,###.##'),
  ('RUB', 'Russian Ruble', null, 'Kopek', 100, null, '#.###,##'),
  ('RWF', 'Rwanda Franc', 'Fr', null, 0, null, '#,###.##'),
  ('SAR', 'Saudi Riyal', 'ر.س', 'Halala', 100, null, '#,###.##'),
  ('SBD', 'Solomon Islands Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('SCR', 'Seychelles Rupee', '₨', 'Cent', 100, null, '#,###.##'),
  ('SDG', 'Sudanese Pound', 'ج.س.', 'Piastre', 100, null, '#,###.##'),
  ('SEK', 'Swedish Krona', 'kr', 'Öre', 100, null, '#.###,##'),
  ('SGD', 'Singapore Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('SHP', 'Saint Helena Pound', null, 'Penny', 100, null, '#,###.##'),
  ('SLL', 'Leone', 'Le', 'Cent', 100, null, '#,###.##'),
  ('SOS', 'Somali Shilling', 'Sh', 'Cent', 100, null, '#,###.##'),
  ('SRD', 'SRD', '$', 'Cent', 100, null, '#,###.##'),
  ('STD', 'Dobra', null, 'Cêntimo', 100, null, '#,###.##'),
  ('SYP', 'Syrian Pound', null, 'Piastre', 100, null, '#,###.##'),
  ('SZL', 'Lilangeni', 'L', 'Cent', 100, null, '#, ###.##'),
  ('THB', 'Baht', '฿', 'Satang', 100, null, '#,###.##'),
  ('TMT', 'Manat', 'TMT', 'Tenge', 100, null, '#,###.##'),
  ('TND', 'Tunisian Dinar', 'د.ت', 'Millime', 1000, null, '#,###.###'),
  ('TOP', 'Pa''anga', 'T$', 'Seniti[L]', 100, null, '#,###.##'),
  ('TRY', 'TRY', '₺', 'Kuruş', 100, null, '#.###,##'),
  ('TTD', 'Trinidad and Tobago Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('TWD', 'TWD', null, 'Fen', 100, null, '#,###.##'),
  ('TZS', 'Tanzanian Shilling', null, 'Senti', 100, null, '#,###.##'),
  ('UAH', 'Ukrainian Hryvnia', '₴', 'Kopiyka', 100, null, '#,###.##'),
  ('UGX', 'Uganda Shilling', 'Sh', null, 0, null, '#,###.##'),
  ('USD', 'US Dollar', '$', 'Cent', 100, 0.01, '#,###.##'),
  ('UYU', 'Peso Uruguayo', '$', 'Centésimo', 100, null, '#.###,##'),
  ('UZS', 'Uzbekistan Sum', 'лв', 'Tiyin', 100, null, '#,###.##'),
  ('VEF', 'VEF', 'Bs.', 'Centimos', 100, null, '#.###,##'),
  ('VND', 'Dong', null, null, 0, null, '#.###'),
  ('VUV', 'Vatu', 'Vt', null, 0, null, '#,###'),
  ('WST', 'Tala', 'T', 'Sene', 100, null, '#,###.##'),
  ('XAF', 'Central African CFA Franc', 'FCFA', null, 0, null, '#,###.##'),
  ('XCD', 'Eastern Carribean Dollar', '$', 'Cent', 100, null, '#,###.##'),
  ('XOF', 'West African CFA Franc', 'CFA', null, 0, null, '#,###.##'),
  ('YER', 'Yemeni Rial', '﷼', 'Fils', 100, 0.01, '#,###.##'),
  ('ZAR', 'Rand', 'R', 'Cent', 100, null, '# ###.##'),
  ('ZMW', 'Zambian Kwacha', 'ZK', 'Ngwee', 100, null, '#,###.##'),
  ('ZWL', 'Zimbabwe Dollar', 'ZWL$', 'Cent', 100, null, '# ###.##')
on conflict (code) do nothing;

insert into public.countries (code, country_name, currency_code, time_zones, number_format)
values
  ('AF', 'Afghanistan', 'AFN', array['Asia/Kabul'], '#,###.##'),
  ('AL', 'Albania', 'ALL', array['Europe/Tirane'], '#,###.##'),
  ('DZ', 'Algeria', 'DZD', array['Africa/Algiers'], '#,###.##'),
  ('AS', 'American Samoa', null, '{}'::text[], '#,###.##'),
  ('AD', 'Andorra', 'EUR', array['Europe/Andorra'], '#,###.##'),
  ('AO', 'Angola', 'AOA', array['Africa/Luanda'], '#,###.##'),
  ('AI', 'Anguilla', 'XCD', array['America/Anguilla'], '#,###.##'),
  ('AQ', 'Antarctica', null, array['Antarctica/Casey', 'Antarctica/Davis', 'Antarctica/DumontDUrville', 'Antarctica/Macquarie', 'Antarctica/Mawson', 'Antarctica/McMurdo', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Antarctica/Syowa', 'Antarctica/Vostok'], '#,###.##'),
  ('AG', 'Antigua and Barbuda', 'XCD', array['America/Antigua'], '#,###.##'),
  ('AR', 'Argentina', 'ARS', array['America/Argentina/Buenos_Aires', 'America/Argentina/Catamarca', 'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/La_Rioja', 'America/Argentina/Mendoza', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Buenos_Aires', 'America/Catamarca', 'America/Cordoba', 'America/Jujuy', 'America/Mendoza'], '#.###,##'),
  ('AM', 'Armenia', 'AMD', array['Asia/Yerevan'], '#,###.##'),
  ('AW', 'Aruba', 'AWG', array['America/Aruba'], '#,###.##'),
  ('AU', 'Australia', 'AUD', array['Australia/Adelaide', 'Australia/Brisbane', 'Australia/Broken_Hill', 'Australia/Currie', 'Australia/Darwin', 'Australia/Eucla', 'Australia/Hobart', 'Australia/Lindeman', 'Australia/Lord_Howe', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney'], '# ###.##'),
  ('AT', 'Austria', 'EUR', array['Europe/Vienna'], '#,###.##'),
  ('AZ', 'Azerbaijan', null, array['Asia/Baku'], '#,###.##'),
  ('BS', 'Bahamas', 'BSD', array['America/Nassau'], '#,###.##'),
  ('BH', 'Bahrain', 'BHD', array['Asia/Bahrain'], '#,###.###'),
  ('BD', 'Bangladesh', 'BDT', array['Asia/Dhaka'], '#,###.##'),
  ('BB', 'Barbados', 'BBD', array['America/Barbados'], '#,###.##'),
  ('BY', 'Belarus', null, array['Europe/Minsk'], '#,###.##'),
  ('BE', 'Belgium', 'EUR', array['Europe/Brussels'], '#,###.##'),
  ('BZ', 'Belize', 'BZD', array['America/Belize'], '#,###.##'),
  ('BJ', 'Benin', 'XOF', array['Africa/Porto-Novo'], '#,###.##'),
  ('BM', 'Bermuda', 'BMD', array['Atlantic/Bermuda'], '#,###.##'),
  ('BT', 'Bhutan', 'BTN', array['Asia/Thimphu'], '#,###.##'),
  ('BO', 'Bolivia, Plurinational State of', 'BOB', '{}'::text[], '#,###.##'),
  ('BQ', 'Bonaire, Sint Eustatius and Saba', null, '{}'::text[], '#,###.##'),
  ('BA', 'Bosnia and Herzegovina', 'BAM', array['Europe/Sarajevo'], '#.###,##'),
  ('BW', 'Botswana', 'BWP', array['Africa/Gaborone'], '#,###.##'),
  ('BV', 'Bouvet Island', null, '{}'::text[], '#,###.##'),
  ('BR', 'Brazil', 'BRL', array['America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Boa_Vista', 'America/Campo_Grande', 'America/Cuiaba', 'America/Eirunepe', 'America/Fortaleza', 'America/Maceio', 'America/Manaus', 'America/Noronha', 'America/Porto_Velho', 'America/Recife', 'America/Rio_Branco', 'America/Santarem', 'America/Sao_Paulo'], '#.###,##'),
  ('IO', 'British Indian Ocean Territory', null, array['Indian/Chagos'], '#,###.##'),
  ('BN', 'Brunei Darussalam', 'BND', array['Asia/Brunei'], '#,###.##'),
  ('BG', 'Bulgaria', 'EUR', array['Europe/Sofia'], '#,###.##'),
  ('BF', 'Burkina Faso', 'XOF', array['Africa/Ouagadougou'], '#,###.##'),
  ('BI', 'Burundi', 'BIF', array['Africa/Bujumbura'], '#,###.##'),
  ('KH', 'Cambodia', 'KHR', array['Asia/Phnom_Penh'], '#,###.##'),
  ('CM', 'Cameroon', 'XAF', array['Africa/Douala'], '#,###.##'),
  ('CA', 'Canada', 'CAD', array['America/Atikokan', 'America/Blanc-Sablon', 'America/Cambridge_Bay', 'America/Creston', 'America/Dawson', 'America/Dawson_Creek', 'America/Edmonton', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Halifax', 'America/Inuvik', 'America/Iqaluit', 'America/Moncton', 'America/Montreal', 'America/Nipigon', 'America/Pangnirtung', 'America/Rainy_River', 'America/Rankin_Inlet', 'America/Regina', 'America/Resolute', 'America/St_Johns', 'America/Swift_Current', 'America/Thunder_Bay', 'America/Toronto', 'America/Vancouver', 'America/Whitehorse', 'America/Winnipeg', 'America/Yellowknife', 'America/Coral_Harbour'], '#,###.##'),
  ('CV', 'Cape Verde', 'CVE', array['Atlantic/Cape_Verde'], '#,###.##'),
  ('KY', 'Cayman Islands', 'KYD', array['America/Cayman'], '#,###.##'),
  ('CF', 'Central African Republic', 'XAF', array['Africa/Bangui'], '#,###.##'),
  ('TD', 'Chad', 'XAF', array['Africa/Ndjamena'], '#,###.##'),
  ('CL', 'Chile', 'CLP', array['America/Santiago', 'Pacific/Easter'], '#.###'),
  ('CN', 'China', 'CNY', array['Asia/Chongqing', 'Asia/Harbin', 'Asia/Kashgar', 'Asia/Shanghai', 'Asia/Urumqi'], '#,###.##'),
  ('CX', 'Christmas Island', null, array['Indian/Christmas'], '#,###.##'),
  ('CC', 'Cocos (Keeling) Islands', null, array['Indian/Cocos'], '#,###.##'),
  ('CO', 'Colombia', 'COP', array['America/Bogota'], '#.###,##'),
  ('KM', 'Comoros', 'KMF', array['Indian/Comoro'], '#,###.##'),
  ('CG', 'Congo', 'XAF', '{}'::text[], '#,###.##'),
  ('CD', 'Congo, The Democratic Republic of the', 'CDF', '{}'::text[], '#,###.##'),
  ('CK', 'Cook Islands', null, array['Pacific/Rarotonga'], '#,###.##'),
  ('CR', 'Costa Rica', 'CRC', array['America/Costa_Rica'], '#.###,##'),
  ('HR', 'Croatia', 'EUR', array['Europe/Zagreb'], '#.###,##'),
  ('CU', 'Cuba', 'CUP', array['America/Havana'], '#,###.##'),
  ('CW', 'Curaçao', null, '{}'::text[], '#,###.##'),
  ('CY', 'Cyprus', 'EUR', array['Asia/Nicosia'], '#.###,##'),
  ('CZ', 'Czech Republic', 'CZK', array['Europe/Prague'], '#.###,##'),
  ('DK', 'Denmark', 'DKK', array['Europe/Copenhagen'], '#.###,##'),
  ('DJ', 'Djibouti', 'DJF', array['Africa/Djibouti'], '#,###.##'),
  ('DM', 'Dominica', 'XCD', array['America/Dominica'], '#,###.##'),
  ('DO', 'Dominican Republic', 'DOP', array['America/Santo_Domingo'], '#,###.##'),
  ('EC', 'Ecuador', null, array['America/Guayaquil', 'Pacific/Galapagos'], '#,###.##'),
  ('EG', 'Egypt', 'EGP', array['Africa/Cairo'], '#,###.##'),
  ('SV', 'El Salvador', 'USD', array['America/El_Salvador'], '#,###.##'),
  ('GQ', 'Equatorial Guinea', 'XAF', array['Africa/Malabo'], '#,###.##'),
  ('ER', 'Eritrea', 'ERN', array['Africa/Asmara', 'Africa/Asmera'], '#,###.##'),
  ('EE', 'Estonia', 'EUR', array['Europe/Tallinn'], '#,###.##'),
  ('ET', 'Ethiopia', 'ETB', array['Africa/Addis_Ababa'], '#,###.##'),
  ('FK', 'Falkland Islands (Malvinas)', 'FKP', '{}'::text[], '#,###.##'),
  ('FO', 'Faroe Islands', null, array['Atlantic/Faroe', 'Atlantic/Faeroe'], '#,###.##'),
  ('FJ', 'Fiji', 'FJD', array['Pacific/Fiji'], '#,###.##'),
  ('FI', 'Finland', 'EUR', array['Europe/Helsinki'], '#,###.##'),
  ('FR', 'France', 'EUR', array['Europe/Paris'], '# ###,##'),
  ('GF', 'French Guiana', null, array['America/Cayenne'], '#,###.##'),
  ('PF', 'French Polynesia', null, array['Pacific/Gambier', 'Pacific/Marquesas', 'Pacific/Tahiti'], '#,###.##'),
  ('TF', 'French Southern Territories', null, '{}'::text[], '#,###.##'),
  ('GA', 'Gabon', 'XAF', array['Africa/Libreville'], '#,###.##'),
  ('GM', 'Gambia', 'GMD', array['Africa/Banjul'], '#,###.##'),
  ('GE', 'Georgia', null, array['Asia/Tbilisi'], '#,###.##'),
  ('DE', 'Germany', 'EUR', array['Europe/Berlin'], '#.###,##'),
  ('GH', 'Ghana', 'GHS', array['Africa/Accra'], '#,###.##'),
  ('GI', 'Gibraltar', 'GIP', array['Europe/Gibraltar'], '#,###.##'),
  ('GR', 'Greece', 'EUR', array['Europe/Athens'], '#,###.##'),
  ('GL', 'Greenland', null, array['America/Danmarkshavn', 'America/Godthab', 'America/Scoresbysund', 'America/Thule', 'America/Nuuk'], '#,###.##'),
  ('GD', 'Grenada', 'XCD', array['America/Grenada'], '#,###.##'),
  ('GP', 'Guadeloupe', null, array['America/Guadeloupe'], '#,###.##'),
  ('GU', 'Guam', null, array['Pacific/Guam'], '#,###.##'),
  ('GT', 'Guatemala', 'GTQ', array['America/Guatemala'], '#,###.##'),
  ('GG', 'Guernsey', null, array['Europe/London'], '#,###.##'),
  ('GN', 'Guinea', 'GNF', array['Africa/Conakry'], '#,###.##'),
  ('GW', 'Guinea-Bissau', 'XOF', array['Africa/Bissau'], '#,###.##'),
  ('GY', 'Guyana', 'GYD', array['America/Guyana'], '#,###.##'),
  ('HT', 'Haiti', 'HTG', array['America/Guatemala', 'America/Port-au-Prince'], '#,###.##'),
  ('HM', 'Heard Island and McDonald Islands', null, '{}'::text[], '#,###.##'),
  ('VA', 'Holy See (Vatican City State)', null, '{}'::text[], '#,###.##'),
  ('HN', 'Honduras', 'HNL', array['America/Tegucigalpa'], '#,###.##'),
  ('HK', 'Hong Kong', 'HKD', array['Asia/Hong_Kong'], '#,###.##'),
  ('HU', 'Hungary', 'HUF', array['Europe/Budapest'], '#.###'),
  ('IS', 'Iceland', 'ISK', array['Atlantic/Reykjavik'], '#.###'),
  ('IN', 'India', 'INR', array['Asia/Kolkata', 'Asia/Calcutta'], '#,##,###.##'),
  ('ID', 'Indonesia', 'IDR', array['Asia/Jakarta', 'Asia/Jayapura', 'Asia/Makassar', 'Asia/Pontianak'], '#.###,##'),
  ('IR', 'Iran', 'IRR', array['Asia/Tehran'], '#,###.##'),
  ('IQ', 'Iraq', 'IQD', array['Asia/Baghdad'], '#,###.###'),
  ('IE', 'Ireland', 'EUR', array['Europe/Dublin'], '#,###.##'),
  ('IM', 'Isle of Man', null, array['Europe/London'], '#,###.##'),
  ('IL', 'Israel', 'ILS', array['Asia/Jerusalem'], '#,###.##'),
  ('IT', 'Italy', 'EUR', array['Europe/Rome'], '#.###,##'),
  ('CI', 'Ivory Coast', 'XOF', array['Africa/Abidjan'], '#,###.##'),
  ('JM', 'Jamaica', 'JMD', array['America/Jamaica'], '#,###.##'),
  ('JP', 'Japan', 'JPY', array['Asia/Tokyo'], '#,###'),
  ('JE', 'Jersey', null, array['Europe/London'], '#,###.##'),
  ('JO', 'Jordan', 'JOD', array['Asia/Amman'], '#,###.###'),
  ('KZ', 'Kazakhstan', 'KZT', array['Asia/Almaty', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Oral', 'Asia/Qyzylorda'], '#,###.##'),
  ('KE', 'Kenya', 'KES', array['Africa/Nairobi'], '#,###.##'),
  ('KI', 'Kiribati', null, array['Pacific/Enderbury', 'Pacific/Kiritimati', 'Pacific/Tarawa', 'Pacific/Kanton'], '#,###.##'),
  ('KP', 'Korea, Democratic Peoples Republic of', 'KPW', '{}'::text[], '#,###.##'),
  ('KR', 'Korea, Republic of', 'KRW', '{}'::text[], '#,###'),
  ('KW', 'Kuwait', 'KWD', array['Asia/Kuwait'], '#,###.###'),
  ('KG', 'Kyrgyzstan', 'KGS', array['Asia/Bishkek'], '#,###.##'),
  ('LA', 'Lao Peoples Democratic Republic', 'LAK', array['Asia/Vientiane'], '#,###.##'),
  ('LV', 'Latvia', 'EUR', array['Europe/Riga'], '#,###.##'),
  ('LB', 'Lebanon', 'LBP', array['Asia/Beirut'], '#,###.##'),
  ('LS', 'Lesotho', 'LSL', array['Africa/Maseru'], '#,###.##'),
  ('LR', 'Liberia', 'LRD', array['Africa/Monrovia'], '#,###.##'),
  ('LY', 'Libya', 'LYD', array['Africa/Tripoli'], '#,###.###'),
  ('LI', 'Liechtenstein', null, array['Europe/Vaduz'], '#,###.##'),
  ('LT', 'Lithuania', 'EUR', array['Europe/Vilnius'], '# ###,##'),
  ('LU', 'Luxembourg', 'EUR', array['Europe/Luxembourg'], '#,###.##'),
  ('MO', 'Macao', 'MOP', '{}'::text[], '#,###.##'),
  ('MK', 'Macedonia', 'MKD', '{}'::text[], '#,###.##'),
  ('MG', 'Madagascar', null, array['Indian/Antananarivo'], '#,###.##'),
  ('MW', 'Malawi', 'MWK', array['Africa/Blantyre'], '#,###.##'),
  ('MY', 'Malaysia', 'MYR', array['Asia/Kuala_Lumpur', 'Asia/Kuching'], '#,###.##'),
  ('MV', 'Maldives', 'MVR', array['Indian/Maldives'], '#,###.##'),
  ('ML', 'Mali', 'XOF', array['Africa/Bamako'], '#,###.##'),
  ('MT', 'Malta', 'EUR', array['Europe/Malta'], '#,###.##'),
  ('MH', 'Marshall Islands', null, array['Pacific/Kwajalein', 'Pacific/Majuro'], '#,###.##'),
  ('MQ', 'Martinique', null, array['America/Martinique'], '#,###.##'),
  ('MR', 'Mauritania', 'MRO', array['Africa/Nouakchott'], '#,###.##'),
  ('MU', 'Mauritius', 'MUR', array['Indian/Mauritius'], '#,###'),
  ('YT', 'Mayotte', null, array['Indian/Mayotte'], '#,###.##'),
  ('MX', 'Mexico', 'MXN', array['America/Bahia_Banderas', 'America/Cancun', 'America/Chihuahua', 'America/Hermosillo', 'America/Matamoros', 'America/Mazatlan', 'America/Merida', 'America/Mexico_City', 'America/Monterrey', 'America/Ojinaga', 'America/Santa_Isabel', 'America/Tijuana'], '#,###.##'),
  ('FM', 'Micronesia, Federated States of', null, '{}'::text[], '#,###.##'),
  ('MD', 'Moldova, Republic of', 'MDL', '{}'::text[], '#,###.##'),
  ('MC', 'Monaco', 'EUR', array['Europe/Monaco'], '#,###.##'),
  ('MN', 'Mongolia', 'MNT', array['Asia/Choibalsan', 'Asia/Hovd', 'Asia/Ulaanbaatar'], '#,###.##'),
  ('ME', 'Montenegro', 'EUR', array['Europe/Belgrade'], '#,###.##'),
  ('MS', 'Montserrat', 'XCD', array['America/Montserrat'], '#,###.##'),
  ('MA', 'Morocco', 'MAD', array['Africa/Casablanca'], '#,###.##'),
  ('MZ', 'Mozambique', 'MZN', array['Africa/Maputo'], '#,###.##'),
  ('MM', 'Myanmar', 'MMK', array['Asia/Rangoon', 'Asia/Yangon'], '#,###.##'),
  ('NA', 'Namibia', 'NAD', array['Africa/Windhoek'], '#,###.##'),
  ('NR', 'Nauru', null, array['Pacific/Nauru'], '#,###.##'),
  ('NP', 'Nepal', 'NPR', array['Asia/Kathmandu', 'Asia/Katmandu'], '#,##,###.##'),
  ('NL', 'Netherlands', 'EUR', array['Europe/Amsterdam'], '#,###.##'),
  ('NC', 'New Caledonia', null, array['Pacific/Noumea'], '#,###.##'),
  ('NZ', 'New Zealand', 'NZD', array['Pacific/Auckland', 'Pacific/Chatham'], '#,###.##'),
  ('NI', 'Nicaragua', 'NIO', array['America/Managua'], '#,###.##'),
  ('NE', 'Niger', 'XOF', array['Africa/Niamey'], '#,###.##'),
  ('NG', 'Nigeria', 'NGN', array['Africa/Lagos'], '#,###.##'),
  ('NU', 'Niue', null, array['Pacific/Niue'], '#,###.##'),
  ('NF', 'Norfolk Island', null, array['Pacific/Norfolk'], '#,###.##'),
  ('MP', 'Northern Mariana Islands', null, array['Pacific/Saipan'], '#,###.##'),
  ('NO', 'Norway', 'NOK', array['Europe/Oslo'], '#.###,##'),
  ('OM', 'Oman', 'OMR', array['Asia/Muscat'], '#,###.###'),
  ('PK', 'Pakistan', 'PKR', array['Asia/Karachi'], '#,###.##'),
  ('PW', 'Palau', null, array['Pacific/Palau'], '#,###.##'),
  ('PS', 'Palestinian Territory, Occupied', 'ILS', array['Asia/Hebron', 'Asia/Jerusalem'], '#,###.##'),
  ('PA', 'Panama', null, array['America/Panama'], '#,###.##'),
  ('PG', 'Papua New Guinea', 'PGK', array['Pacific/Port_Moresby'], '#,###.##'),
  ('PY', 'Paraguay', 'PYG', array['America/Asuncion'], '#,###.##'),
  ('PE', 'Peru', 'PEN', array['America/Lima'], '#,###.##'),
  ('PH', 'Philippines', 'PHP', array['Asia/Manila'], '#,###.##'),
  ('PN', 'Pitcairn', null, array['Pacific/Pitcairn'], '#,###.##'),
  ('PL', 'Poland', 'PLN', array['Europe/Warsaw'], '#.###,##'),
  ('PT', 'Portugal', 'EUR', array['Atlantic/Azores', 'Atlantic/Madeira', 'Europe/Lisbon'], '#,###.##'),
  ('PR', 'Puerto Rico', null, array['America/Puerto_Rico'], '#,###.##'),
  ('QA', 'Qatar', 'QAR', array['Asia/Qatar'], '#,###.##'),
  ('RO', 'Romania', 'RON', array['Europe/Bucharest'], '#,###.##'),
  ('RU', 'Russian Federation', 'RUB', '{}'::text[], '#.###,##'),
  ('RW', 'Rwanda', 'RWF', array['Africa/Kigali'], '#,###.##'),
  ('RE', 'Réunion', null, '{}'::text[], '#,###.##'),
  ('BL', 'Saint Barthélemy', null, '{}'::text[], '#,###.##'),
  ('SH', 'Saint Helena, Ascension and Tristan da Cunha', 'SHP', '{}'::text[], '#,###.##'),
  ('KN', 'Saint Kitts and Nevis', 'XCD', array['America/St_Kitts'], '#,###.##'),
  ('LC', 'Saint Lucia', 'XCD', array['America/St_Lucia'], '#,###.##'),
  ('MF', 'Saint Martin (French part)', null, '{}'::text[], '#,###.##'),
  ('PM', 'Saint Pierre and Miquelon', null, '{}'::text[], '#,###.##'),
  ('VC', 'Saint Vincent and the Grenadines', 'XCD', array['America/St_Vincent'], '#,###.##'),
  ('WS', 'Samoa', 'WST', array['Pacific/Apia'], '#,###.##'),
  ('SM', 'San Marino', 'EUR', array['Europe/Rome'], '#,###.##'),
  ('ST', 'Sao Tome and Principe', 'STD', '{}'::text[], '#,###.##'),
  ('SA', 'Saudi Arabia', 'SAR', array['Asia/Riyadh'], '#,###.##'),
  ('SN', 'Senegal', 'XOF', array['Africa/Dakar'], '#,###.##'),
  ('RS', 'Serbia', 'RSD', array['Europe/Belgrade'], '#,###.##'),
  ('SC', 'Seychelles', 'SCR', array['Indian/Mahe'], '#,###.##'),
  ('SL', 'Sierra Leone', 'SLL', array['Africa/Freetown'], '#,###.##'),
  ('SG', 'Singapore', 'SGD', array['Asia/Singapore'], '#,###.##'),
  ('SX', 'Sint Maarten (Dutch part)', null, '{}'::text[], '#,###.##'),
  ('SK', 'Slovakia', 'EUR', array['Europe/Bratislava'], '#,###.##'),
  ('SI', 'Slovenia', 'EUR', array['Europe/Belgrade'], '#,###.##'),
  ('SB', 'Solomon Islands', 'SBD', array['Pacific/Guadalcanal'], '#,###.##'),
  ('SO', 'Somalia', 'SOS', array['Africa/Mogadishu'], '#,###.##'),
  ('ZA', 'South Africa', 'ZAR', array['Africa/Johannesburg'], '# ###.##'),
  ('GS', 'South Georgia and the South Sandwich Islands', null, '{}'::text[], '#,###.##'),
  ('SS', 'South Sudan', null, array['Africa/Juba'], '#,###.##'),
  ('ES', 'Spain', 'EUR', array['Africa/Ceuta', 'Atlantic/Canary', 'Europe/Madrid'], '#,###.##'),
  ('LK', 'Sri Lanka', 'LKR', array['Asia/Colombo'], '#,###.##'),
  ('SD', 'Sudan', 'SDG', array['Africa/Khartoum'], '#,###.##'),
  ('SR', 'Suriname', 'SRD', array['America/Paramaribo'], '#,###.##'),
  ('SJ', 'Svalbard and Jan Mayen', null, '{}'::text[], '#,###.##'),
  ('SZ', 'Swaziland', 'SZL', array['Africa/Mbabane'], '#, ###.##'),
  ('SE', 'Sweden', 'SEK', array['Europe/Stockholm'], '#.###,##'),
  ('CH', 'Switzerland', 'CHF', array['Europe/Zurich'], '#''###.##'),
  ('SY', 'Syria', 'SYP', '{}'::text[], '#,###.##'),
  ('TW', 'Taiwan', 'TWD', '{}'::text[], '#,###.##'),
  ('TJ', 'Tajikistan', null, array['Asia/Dushanbe'], '#,###.##'),
  ('TZ', 'Tanzania', 'TZS', array['Africa/Dar_es_Salaam'], '#,###.##'),
  ('TH', 'Thailand', 'THB', array['Asia/Bangkok'], '#,###.##'),
  ('TL', 'Timor-Leste', null, '{}'::text[], '#,###.##'),
  ('TG', 'Togo', 'XOF', array['Africa/Lome'], '#,###.##'),
  ('TK', 'Tokelau', null, array['Pacific/Fakaofo'], '#,###.##'),
  ('TO', 'Tonga', 'TOP', array['Pacific/Tongatapu'], '#,###.##'),
  ('TT', 'Trinidad and Tobago', 'TTD', array['America/Port_of_Spain'], '#,###.##'),
  ('TN', 'Tunisia', 'TND', array['Africa/Tunis'], '#,###.###'),
  ('TM', 'Turkmenistan', 'TMT', array['Asia/Ashgabat'], '#,###.##'),
  ('TC', 'Turks and Caicos Islands', null, '{}'::text[], '#,###.##'),
  ('TV', 'Tuvalu', null, array['Pacific/Funafuti'], '#,###.##'),
  ('TR', 'Türkiye', 'TRY', array['Europe/Istanbul'], '#.###,##'),
  ('UG', 'Uganda', 'UGX', array['Africa/Kampala'], '#,###.##'),
  ('UA', 'Ukraine', 'UAH', array['Europe/Kiev', 'Europe/Simferopol', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Kyiv'], '#,###.##'),
  ('AE', 'United Arab Emirates', 'AED', array['Asia/Dubai'], '#,###.##'),
  ('GB', 'United Kingdom', 'GBP', array['Europe/London'], '#,###.##'),
  ('US', 'United States', 'USD', array['America/Adak', 'America/Anchorage', 'America/Boise', 'America/Chicago', 'America/Denver', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Knox', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Tell_City', 'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Juneau', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'America/Los_Angeles', 'America/Menominee', 'America/Metlakatla', 'America/New_York', 'America/Nome', 'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/Phoenix', 'America/Sitka', 'America/Yakutat', 'Pacific/Honolulu', 'America/Indianapolis', 'America/Louisville'], '#,###.##'),
  ('UM', 'United States Minor Outlying Islands', null, '{}'::text[], '#,###.##'),
  ('UY', 'Uruguay', 'UYU', array['America/Montevideo'], '#.###,##'),
  ('UZ', 'Uzbekistan', 'UZS', array['Asia/Samarkand', 'Asia/Tashkent'], '#,###.##'),
  ('VU', 'Vanuatu', 'VUV', array['Pacific/Efate'], '#,###'),
  ('VE', 'Venezuela, Bolivarian Republic of', 'VEF', '{}'::text[], '#.###,##'),
  ('VN', 'Vietnam', 'VND', '{}'::text[], '#.###'),
  ('VG', 'Virgin Islands, British', null, '{}'::text[], '#,###.##'),
  ('VI', 'Virgin Islands, U.S.', null, '{}'::text[], '#,###.##'),
  ('WF', 'Wallis and Futuna', null, '{}'::text[], '#,###.##'),
  ('EH', 'Western Sahara', null, array['Africa/El_Aaiun'], '#,###.##'),
  ('YE', 'Yemen', 'YER', array['Asia/Aden'], '#,###.##'),
  ('ZM', 'Zambia', 'ZMW', array['Africa/Lusaka'], '#,###.##'),
  ('XK', 'Kosovo', 'EUR', array['Europe/Belgrade'], '#,###.##'),
  ('ZW', 'Zimbabwe', 'ZWL', array['Africa/Harare'], '# ###.##'),
  ('AX', 'Åland Islands', null, '{}'::text[], '#,###.##')
on conflict (code) do nothing;

-- 2. The Company.

alter table public.merchants
  add column if not exists abbr text,
  add column if not exists country_code text,
  add column if not exists default_currency text;

-- The systems made before this migration. The Philippines and the peso were this app's defaults until
-- the 2026-10-08 teardown, and the abbreviation is the name's initials; all three are editable on the
-- Company screen.
update public.merchants m
set abbr = (
  select upper(left(string_agg(left(t.word, 1), '' order by t.ord), 3))
  from regexp_split_to_table(btrim(m.name), '\s+') with ordinality as t (word, ord)
  where t.word <> ''
)
where m.abbr is null;

update public.merchants set abbr = 'SYS' where abbr is null or abbr = '';
update public.merchants set country_code = 'PH' where country_code is null;
update public.merchants set default_currency = 'PHP' where default_currency is null;

alter table public.merchants
  alter column abbr set not null,
  alter column country_code set not null,
  alter column default_currency set not null;

do $$
begin
  -- ERPNext appends the abbreviation to account, cost center and warehouse names. Here it is displayed
  -- after those names rather than stored in them, so editing it renames nothing; it still has to read
  -- as a short suffix.
  if not exists (select 1 from pg_constraint where conname = 'merchants_abbr_shape') then
    alter table public.merchants add constraint merchants_abbr_shape
      check (length(abbr) between 1 and 10 and abbr !~ '\s');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'merchants_country_fk') then
    alter table public.merchants add constraint merchants_country_fk
      foreign key (country_code) references public.countries (code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'merchants_default_currency_fk') then
    alter table public.merchants add constraint merchants_default_currency_fk
      foreign key (default_currency) references public.currency_presets (code);
  end if;
end
$$;


-- 3. Fiscal years.

create table if not exists public.fiscal_years (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  -- ERPNext's name for the record: "2026", or "2026-2027" for a year spanning two.
  year text not null,
  year_start_date date not null,
  year_end_date date not null,
  is_short_year boolean not null default false,
  is_default boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint fiscal_years_id_merchant unique (id, merchant_id),
  constraint fiscal_years_year_length check (length(btrim(year)) between 1 and 20),
  constraint fiscal_years_year_unique unique (merchant_id, year),
  -- ERPNext: a full year ends the day before the same date a year on. Only a short year, a transition
  -- period, may end sooner, and it must.
  constraint fiscal_years_length check (
    year_end_date > year_start_date
    and case
      when is_short_year then year_end_date < (year_start_date + interval '1 year')::date - 1
      else year_end_date = (year_start_date + interval '1 year')::date - 1
    end
  ),
  -- Two years of one system may not share a day, or a posting date would belong to both.
  constraint fiscal_years_no_overlap exclude using gist (
    merchant_id with =,
    daterange(year_start_date, year_end_date, '[]') with &&
  )
);

alter table public.fiscal_years enable row level security;

create index if not exists fiscal_years_merchant_id_idx on public.fiscal_years (merchant_id);

-- One default per system: the year ERPNext starts posting dates and report filters in.
create unique index if not exists fiscal_years_one_default on public.fiscal_years (merchant_id) where is_default;

-- Making a year the default clears the old one first, inside the same statement, so the client sends one
-- update and the index above never sees two defaults. Not security definer: the caller must be allowed
-- to update the other row as well, and RLS decides that like any other write.
create or replace function private.fiscal_years_single_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    update public.fiscal_years
    set is_default = false
    where merchant_id = new.merchant_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

revoke execute on function private.fiscal_years_single_default() from public, anon, authenticated, service_role;

drop trigger if exists fiscal_years_single_default on public.fiscal_years;
create trigger fiscal_years_single_default
  before insert or update of is_default on public.fiscal_years
  for each row execute function private.fiscal_years_single_default();

-- The membership shape of every business table so far (tenancy.md §5). The Users & Access step moves
-- these onto per-doctype role permissions.
drop policy if exists fiscal_years_select_own_merchant on public.fiscal_years;
create policy fiscal_years_select_own_merchant on public.fiscal_years
  for select to authenticated
  using (merchant_id in (select private.current_merchant_ids()));

drop policy if exists fiscal_years_insert_own_merchant on public.fiscal_years;
create policy fiscal_years_insert_own_merchant on public.fiscal_years
  for insert to authenticated
  with check (merchant_id in (select private.current_merchant_ids()));

drop policy if exists fiscal_years_update_own_merchant on public.fiscal_years;
create policy fiscal_years_update_own_merchant on public.fiscal_years
  for update to authenticated
  using (merchant_id in (select private.current_merchant_ids()))
  with check (merchant_id in (select private.current_merchant_ids()));

drop policy if exists fiscal_years_delete_own_merchant on public.fiscal_years;
create policy fiscal_years_delete_own_merchant on public.fiscal_years
  for delete to authenticated
  using (merchant_id in (select private.current_merchant_ids()));


-- 4. Seeding. ERPNext's setup wizard creates a company's first fiscal year; here creating a system does.
-- One `after insert` trigger per foundation step, named merchants_seed_NN_<area>: Postgres fires
-- triggers on the same event in name order, so a later step's seed can rely on an earlier one's rows.
--
-- Security definer, because it writes rows the client's own policies are not consulted for. The owner
-- check keeps it to the caller's own new system (CLAUDE.md §6.2 item 3); no JWT means a migration or the
-- SQL Editor, both of which already run as the owner.
create or replace function private.seed_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  -- "Today" in the company's country: a system made on New Year's Eve in Manila gets the year Manila
  -- is in, not the one UTC is still in.
  v_year := extract(year from (now() at time zone coalesce(
    (select c.time_zones[1] from public.countries c where c.code = new.country_code), 'UTC'
  )));

  insert into public.fiscal_years (merchant_id, year, year_start_date, year_end_date, is_default)
  values (new.id, v_year::text, make_date(v_year, 1, 1), make_date(v_year, 12, 31), true)
  on conflict do nothing;

  return new;
end;
$$;

revoke execute on function private.seed_company() from public, anon, authenticated, service_role;

drop trigger if exists merchants_seed_10_company on public.merchants;
create trigger merchants_seed_10_company
  after insert on public.merchants
  for each row execute function private.seed_company();

-- The systems that already exist.
insert into public.fiscal_years (merchant_id, year, year_start_date, year_end_date, is_default)
select m.id, y.v::text, make_date(y.v, 1, 1), make_date(y.v, 12, 31), true
from public.merchants m
cross join lateral (
  select extract(year from (now() at time zone coalesce(
    (select c.time_zones[1] from public.countries c where c.code = m.country_code), 'UTC'
  )))::integer as v
) y
where not exists (select 1 from public.fiscal_years f where f.merchant_id = m.id);
