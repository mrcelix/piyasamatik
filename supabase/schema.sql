-- Piyasamatik.com — Supabase sema tanimi
--
-- Kullanim: Supabase Dashboard > SQL Editor > yeni sorgu > bu dosyanin
-- tamamini yapistirip calistirin. Dosya idempotent'tir: birden fazla kez
-- calistirilabilir, mevcut tablolardaki veriyi silmez.
--
-- Bu dosya README.md'deki "Uyelik ve giris (Supabase)" bolumunde ayri ayri
-- verilen SQL bloklarinin birlestirilmis halidir. Tablo/sutun adlari
-- src/main/auth.ts ve src/main/crashReporter.ts icindeki insert/upsert
-- cagrilariyla birebir eslesir; degistirirseniz orayi da guncelleyin.
--
-- NOT: Bu dosyayi calistirmak Google ile giris ozelligini AKTIF ETMEZ. Onun
-- icin ayrica Dashboard > Authentication > Providers > Google'i etkinlestirip
-- Google Cloud'dan alinmis OAuth Client ID/Secret girmeniz gerekir (bkz.
-- README.md).

-- ---------------------------------------------------------------------------
-- 1) user_data — bulut senkronizasyonu (ayarlar + izleme listesi)
--
-- src/main/auth.ts icindeki pushToCloud() bu tabloya upsert yapar; upsert
-- hem INSERT hem UPDATE yolunu kullanabildigi icin her iki politika da
-- gereklidir. Kullanici yalnizca kendi satirini gorebilir/yazabilir.
-- ---------------------------------------------------------------------------
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "Users can view own data" on public.user_data;
create policy "Users can view own data" on public.user_data
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own data" on public.user_data;
create policy "Users can insert own data" on public.user_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own data" on public.user_data;
create policy "Users can update own data" on public.user_data
  for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) feedback — Ayarlar > Geri Bildirim
--
-- Giris yapmamis kullanicilar da gonderebilsin diye insert herkese aciktir.
-- Okuma/guncelleme/silme politikasi bilerek TANIMLANMAMISTIR: RLS acikken
-- politikasi olmayan islem herkese kapalidir, yani gonderilen kayitlari
-- yalnizca Dashboard'dan (service role) siz gorebilirsiniz.
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  message text not null,
  app_version text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "Anyone can submit feedback" on public.feedback;
create policy "Anyone can submit feedback" on public.feedback
  for insert with check (true);

-- ---------------------------------------------------------------------------
-- 3) error_reports — otomatik cokme/hata raporlama
--
-- Ayarlar > Genel > "Cokme/hata raporlarini otomatik gonder" (varsayilan
-- acik). Bu tablo olusturulmadan once raporlama denemeleri sessizce basarisiz
-- olur; uygulama hatayi yutar, kullaniciya bir sey gostermez.
--
-- Gonderilen alanlar src/main/crashReporter.ts ile eslesir. Izleme listesi
-- icerigi veya kisisel veri gonderilmez; message 2000, stack 8000 karakterde
-- kirpilir.
-- ---------------------------------------------------------------------------
create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  source text not null,
  message text not null,
  stack text,
  context text,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

alter table public.error_reports enable row level security;

drop policy if exists "Anyone can submit error reports" on public.error_reports;
create policy "Anyone can submit error reports" on public.error_reports
  for insert with check (true);

-- ---------------------------------------------------------------------------
-- Dogrulama: asagidaki sorgu uc satir dondurmelidir (rls_enabled hepsinde t).
-- ---------------------------------------------------------------------------
-- select tablename, rowsecurity as rls_enabled
--   from pg_tables
--  where schemaname = 'public'
--    and tablename in ('user_data', 'feedback', 'error_reports')
--  order by tablename;
