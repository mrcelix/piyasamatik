# Piyasamatik

Doviz, altin, ABD borsasi (hisse/endeks) ve kripto para takibi icin Electron tabanli, sistem tepsisinde yasayan bir masaustu widget'i.

## Calistirma

```bash
npm install
npm start
```

`npm start` once TypeScript kaynaklarini `dist/` altina derler, sonra Electron'u baslatir. Pencere ekranin sag ust kosesinde, her zaman ustte, cerceve olmadan acilir. Sistem tepsisinde bir simge belirir; sag tik menusunden goster/gizle, simdi yenile, Windows ile baslat ve cikis secenekleri bulunur. Ana pencere acikken gorev cubugunda da gorunur (tepsi simgesinden bagimsiz olarak); ancak simge durumuna kucultuldugunde veya "Pencereyi Gizle" ile gizlendiginde gorev cubugundaki girdi de kalkar ve sadece sistem tepsisindeki simge (saatin oldugu alan) kalir — geri getirmek icin o simgeye tiklamak yeterli.

## Durum cubugu

Ana pencerenin en altinda ince bir durum cubugu bulunur: izlenen oge sayisi, verilerin en son ne zaman guncellendigi (saat + "X sn/dk once" seklinde canli sayac) ve uygulamanin surum numarasi. Bu cubuk otomatik sigdir hesabina dahildir.

Gelistirme sirasinda otomatik yeniden derleme icin:

```bash
npm run dev
```

(Bu build.js'i --watch modunda calistirir; ayri bir terminalde `electron .` calistirmaniz gerekir.)

## Windows kurulum paketi olusturma

```bash
npm run pack
```

`electron-builder` ile `dist/` altinda bir NSIS kurulum programı (.exe) uretir. Ilk calistirmada electron-builder gerekli Windows araclarini (winCodeSign vb.) indirir; internet baglantisi gerekir.

## Otomatik guncelleme (GitHub Releases)

Uygulama tamamen kendi kendine guncellenir (`electron-updater`): acilista, her 4 saatte bir otomatik olarak ve Ayarlar > Guncelleme'den manuel olarak GitHub Releases uzerinden yeni surum kontrolu yapar. Bunun calismasi icin:

1. `package.json` > `build.publish` altindaki `owner`/`repo` alanlarini kendi GitHub kullanici adiniz ve repo isminizle degistirin.
2. Kodu bir GitHub reposuna push'layin (henuz bir git deposu yok; `git init` ile baslayabilirsiniz).
3. Yeni bir surum yayinlamak icin: `GH_TOKEN=<kisisel-erisim-tokeniniz> npm run release` — bu, `dist/` altinda kurulum dosyalarini uretir VE GitHub Releases'e otomatik yukler (`latest.yml` dahil, electron-updater'in kontrol ettigi dosya).
4. Kullanicidaki eski surumler yeni bir Release'i bulunca arka planda otomatik indirir. Indirme bitince Windows bildirimi gosterilir ve **60 saniye icinde uygulama kendini otomatik olarak yeniden baslatip gunceller** — hicbir tikma gerekmez. Daha erken guncellemek isterseniz bildirime veya Ayarlar > Guncelleme'deki "Yeniden baslat ve guncelle" butonuna tiklayabilirsiniz.

Paketlenmemis (gelistirme) modda "Guncellemeleri kontrol et" butonu bilgilendirici bir mesaj gosterir, hata vermez — auto-update sadece `npm run pack`/`npm run release` ile paketlenmis kurulumlarda calisir.

## Uyelik ve Google ile giris (Supabase)

Ayarlar > Hesap bolumunden Google hesabiyla giris yapilabilir; giris yapan kullanicinin ayarlari ve izleme listesi Supabase'e (Postgres + Auth) kaydedilir, boylece ayni hesapla baska bir bilgisayarda da senkronize olur.

**Nasil calisir:**
- Google girisi, uygulamanin gecici olarak actigi bir `http://127.0.0.1:<port>/callback` yerel sunucusu ile PKCE akisi kullanir; sistem tarayicisinda Google giris ekrani acilir, tamamlaninca tarayici bu yerel adrese yonlendirilir ve uygulama oturumu tamamlar.
- Oturum bilgisi (refresh token) `safeStorage` ile diskte sifreli olarak saklanir, uygulama kapatilip acildiginda tekrar giris istemez.
- Ilk girişte: bulutta bu hesaba ait veri varsa (baska bir cihazdan) o veri cekilip yerel ayarlarin/izleme listesinin uzerine yazilir; yoksa mevcut yerel veriniz buluta yuklenir.
- Sonraki her ayar/izleme listesi degisikligi, giris yapiliyken birkaç saniye içinde otomatik olarak buluta yazilir (debounce).

**Bu ozelligin calismasi icin gerekenler (sizin yapmaniz gerekiyor, ben yapamam):**

1. Supabase projenizin SQL Editor'unde asagidaki tabloyu ve RLS politikalarini olusturun:

```sql
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users can view own data" on public.user_data
  for select using (auth.uid() = user_id);

create policy "Users can insert own data" on public.user_data
  for insert with check (auth.uid() = user_id);

create policy "Users can update own data" on public.user_data
  for update using (auth.uid() = user_id);
```

2. **Geri Bildirim** (Ayarlar > Geri Bildirim) icin ayrica su tabloyu olusturun (giris yapmis olsun olmasin herkes gonderebilsin diye insert herkese acik, okuma/degistirme kapali):

```sql
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  message text not null,
  app_version text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Anyone can submit feedback" on public.feedback
  for insert with check (true);
```

3. Supabase Dashboard > Authentication > Providers > Google'i etkinlestirin. Bunun icin bir Google Cloud projesinde OAuth Client ID/Secret olusturup (Google Cloud Console > APIs & Services > Credentials), Authorized redirect URI olarak Supabase'in kendi callback adresini eklemeniz gerekir: `https://<proje-id>.supabase.co/auth/v1/callback` (bu adres, Supabase'in size Google provider ayarlari sayfasinda gosterdigi adresle ayni olmalidir). Client ID/Secret'i Supabase'deki Google provider ayarlarina yapistirin.

Bu iki adim tamamlanmadan "Google ile Giris Yap" butonu "provider is not enabled" hatasi verir (bu, uygulamadaki bir hata degil, henuz tamamlanmamis bir kurulum adimidir).

`src/main/auth.ts` icindeki `SUPABASE_URL`/`SUPABASE_ANON_KEY` degerleri sizin projenize aittir; bu anahtar herkese acik/istemci tarafinda kullanilmak icin tasarlanmistir (guvenlik RLS politikalariyla saglanir), ancak `service_role` anahtarini asla koda veya baska bir yere eklemeyin.

## Veri kaynaklari (ucretsiz, API anahtari gerekmez)

- **Doviz & altin (TRY)**: `finans.truncgil.com/today.json` — USD/EUR/... kurlari ve gram/ceyrek/yarim/tam/cumhuriyet/resat/hamit altin, ons altin, gumus, platin.
- **ABD hisseleri & endeksler**: Yahoo Finance'in resmi olmayan `query1.finance.yahoo.com` chart ve search uc noktalari (key gerekmez, ancak Yahoo bu uc noktalari degistirebilir/rate limit uygulayabilir).
- **Kripto paralar**: CoinGecko public API (`api.coingecko.com`), fiyat ve arama icin.

Bu servisler resmi/dokumante edilmemis veya rate-limit'e tabi olabilir; uzun vadeli kullanimda bir servis calismazsa ilgili saglayici modulu (`src/main/providers/`) guncellenmesi gerekebilir.

## Ogeekleme

Sag ust `+` butonuna basip arama kutusuna sembol veya isim yazarak (ornek: `USD`, `gram altin`, `AAPL`, `bitcoin`, `S&P`) doviz, altin/emtia, ABD hisse/endeks ve kripto kategorilerinin tamami ayni arama sonucu listesinde gelir; sonuca tiklamak izleme listesine ekler. Her satirin uzerine gelince cikan kirmizi `x` ile listeden kaldirilir.

## Ayri pencereler (mini widget'lar)

Her satirin uzerine gelince beliren `⧉` butonuna basmak o ogeyi kendi kucuk, her zaman ustte, surukleneblir penceresinde acar (sadece sembol + fiyat + degisim). Ayni butona tekrar basmak (veya mini pencerenin sol ustundeki `↩` butonu) onu tekrar tek pencereye "katistirir" (mini pencere kapanir, oge ana listede kalmaya devam eder). Ayri pencereler ayarlar penceresinden de yonetilebilir ve konumlari uygulama kapatilip acildiginda hatirlanir.

## Miknatis (pencere yapistirma)

Miknatis acikken (varsayilan: acik) herhangi bir Piyasamatik penceresini (ana pencere, mini pencereler, ayarlar) suruklerken ekran kenarlarina veya diger Piyasamatik pencerelerinin kenarlarina ~16px yaklastiginda pencere otomatik olarak o kenara yapisir. Ayarlar penceresinden acilip kapatilabilir.

## Gorunumler

Ana pencerenin dis bardaki disli (⚙) simgesinden Ayarlar penceresi acilir; buradan asagidaki gorunum modlarindan biri secilebilir; degisiklik aninda ana pencereye yansir:
- **Liste**: detayli satirlar (kategori, sparkline, K/Z dahil)
- **Kompakt**: dar satirlar, kategori etiketi ve sparkline gizli
- **Izgara** (varsayilan): sabit 120px genislikte, otomatik satirlara bolunen kart gorunumu; kategori etiketi (DOVIZ, HISSE, ...) varsayilan olarak gizlidir, Ayarlar > Gorunum'den acilabilir. Ana pencerenin varsayilan genisligi (390px), ilk acilista tam olarak 3 kart yan yana sigacak sekilde ayarlanmistir (pencere yine de serbestce yeniden boyutlandirilabilir).
- **Tablo**: tek satirlik, yatay hizali sutunlar (rakip uygulamalardaki klasik piyasa tablosu gorunumu)
- **Kayan Serit**: bu secim ana pencerede degil, ayri, ince ve her zaman ustte kalan bir "kayan serit" penceresinde acilir (klasik borsa bandi gibi) — tum ogeleri fiyat + degisim ile yatayda kaydirir (uzerine gelince kayma durur). Ana pencerenin kendi listesi bu modda bos kalir, sadece serit penceresinin acildigini belirtir. Serit penceresi kapatilirsa gorunum otomatik olarak Izgara'ya doner; konum/boyutu `settings.json` icinde `tickerWindowBounds` altinda hatirlanir.
- **Isi Haritasi**: her ogenin degisim yuzdesine gore yesil/kirmizi renk yogunlugunda karolar (Finviz benzeri)

## Ayarlar penceresi (mega-menu)

Ana pencere basligindaki disli simgesinden acilir. Sol tarafta bir menu ile gruplara ayrilmistir:
- **Genel**: yenileme araligi, Windows ile baslatma, sistem tepsisi simgesi acik/kapali, genel kisayol (`Ctrl+Shift+M`) acik/kapali
- **Pencereler**: ana pencereyi / mini pencereleri ayri ayri her zaman ustte tutma, miknatis, otomatik sigdir, saydam pencereler ve saydamlik orani (%40-%100)
- **Gorunum**: gorunum modu (Liste/Kompakt/Izgara/Tablo/Kayan Serit/Isi Haritasi), Izgara'da kategori etiketini goster/gizle, tema (Koyu/Acik), renk sablonu (Mavi/Altin/Yesil/Kirmizi/Mor vurgu rengi)
- **Guncelleme**: surum bilgisi, manuel guncelleme kontrolu (otomatik kontrol/indirme/kurulum zaten arka planda calisir)
- **Hesap**: Google ile giris/cikis, bulut senkronizasyon durumu
- **Izleme Listesi**: her oge icin "Detay" altinda portfoy (adet + ortalama maliyet), Fiyat alarmi (ustu/alti), Yuzde alarmi (gunluk % artis/azalis) ve Oran alarmi (baska bir izlenen ogeyle karsilastirma), ayri pencerede goster/kapat, favori, listeden kaldir
- **Alarm**: izlenen tum ogelere birden uygulanan genel gunluk % artis/azalis alarmi
- **Geri Bildirim**: oneri, hata bildirimi veya istek yazip gonderme (Supabase'e kaydedilir; giris yapmis kullanicilar icin hesap/e-posta otomatik eklenir, giris yapmamis kullanicilar da e-posta alanini bos birakip anonim gonderebilir)

Izleme listesi ve ayarlar `%APPDATA%/Piyasamatik/` altinda `watchlist.json` ve `settings.json` olarak saklanir (mini pencerelerin konum/boyutlari da `settings.json` icinde `detachedWindows` altinda tutulur). Uygulama daha once "Mini Takip" adiyla calistiysa, ilk acilista `%APPDATA%/Mini Takip/` icindeki veriler otomatik olarak yeni klasore tasinir.

## Sag tik menusu

Ana pencere, mini pencereler, kayan serit penceresi, grafik penceresi ve ayarlar penceresinin herhangi bir yerine sag tiklamak, o pencereye ozgu hizli islem menusunu acar (ana pencerede: yenile, oge ekle, kur cevirici, haberler, miknatis/otomatik sigdir/her zaman ustte acik-kapali, ayarlar, gizle, cikis; mini pencerede: gecmis grafik, her zaman ustte acik-kapali, listeye don, **Ana Pencereyi Goster**; kayan serit penceresinde: simdi yenile, listeye don). Ana pencere ve mini pencereler icin "her zaman ustte" birbirinden bagimsiz ayarlanabilir — biri acik, digeri kapali olabilir.

Ana penceredeki listede bos bir alana (bir satirin/karonun uzerine degil) cift tiklamak "widget modu"na gecirir: baslik cubugu, sekmeler ve durum cubugu gizlenir, pencerenin arka plani tamamen saydamlasir (masaustu arkadan gorunur) ve sadece ogelerin kendi kutulari/karolari (kendi opak arka planlariyla) ekranda kalir — sanki her oge kendi basina bir mini pencereymis gibi. Bu moddan cikmanin uc yolu var: bos alana (ya da artik gorunmez olan bosluga) tekrar cift tiklamak, `Esc` tusuna basmak, veya bu moddayken herhangi bir kutuya sag tiklayip acilan menunun en ustundeki "Ana Pencereyi Goster"i secmek. Ayni menudeki "Pencereleri Kilitle" onay kutusu isaretlenirse (sadece Isi Haritasi gorunumunde anlamli), kutulara sol tiklamak artik gecmis fiyat grafigini acmaz — yanlislikla grafik acilmadan kutularla ugrasmak icin. Kilit, widget modundan cikildiginda otomatik olarak kalkar. Ayrica herhangi bir mini pencerenin sag tik menusunden "Ana Pencereyi Goster" secilerek, "Pencereyi Gizle" ile tamamen gizlenmis olan ana pencere de geri getirilebilir.

## Otomatik sigdir

Varsayilan olarak acik. Ana pencere, icerigindeki (goster ilen ogeler + secili gorunum modu) gercek yuksekligine gore kendini otomatik daraltip genisletir (genislik sabit kalir, siz ayarlarsiniz). Mini pencereler ise her zaman sabit, ideal olcude (220x90) acilir — boylece boyut oge verisine (isim/fiyat uzunlugu) gore degismez, tum widget'lar tutarli gorunur. Ana pencere basligindaki simgeden acilip kapatilabilir; Ayarlar > Pencereler'den de yonetilir.

## Saydamlik

Ana pencere basligindaki saydamlik simgesiyle (veya Ayarlar > Pencereler'den) acilip kapatilabilir; acikken tum Piyasamatik pencereleri (ana, mini, kayan serit, grafik) belirlenen orana gore saydamlasir. Saydamlik orani Ayarlar > Pencereler'deki kaydirici ile %40 ile %100 arasinda ayarlanabilir (varsayilan %88).

## Yon oku

Her satirda (ve mini pencerede) fiyatin yaninda kucuk bir ok belirir: bir onceki veriye gore fiyat yukselmisse yesil `▲`, dusmusse kirmizi `▼`, degismemisse gri `▬`. Bu, gunluk degisim yuzdesinden (`row-change`) bagimsiz olarak sadece en son iki guncelleme arasindaki ani yonu gosterir.

## Sekmeler, kategori filtresi ve siralama

Ana pencerede liste ustunde **★ Favoriler** sekmesi, yaninda bir kategori kutusu (Tumu/Doviz/Altin/Hisse/Endeks/Kripto) ve onun saginda bir **Gorunum** kutusu (Liste/Kompakt/Izgara/Tablo/Kayan Serit/Isi Haritasi) bulunur. Kategori kutusundan herhangi bir secim yapmak — "Tumu" dahil — Favoriler filtresinden de cikar (eskiden ayri bir "Tumu" sekmesiyle yapilan isi tek adimda yapar). Gorunum kutusu, Ayarlar > Gorunum'daki secimle ayni ayari degistirir; ana pencereden hizlica degistirilebilir. Satirlar surukle-birak ile yeniden siralanabilir (fare ile bir satiri tutup baska bir satirin uzerine birakmak yeterlidir); siralama kalicidir.

## Fiyat, yuzde ve oran alarmlari

Yeni bir oge izleme listesine eklendiginde Ayarlar penceresi otomatik acilir ve o ogenin "Detay" paneline odaklanir, boylece alarm kurulumuna hemen devam edebilirsiniz. Bu panelde uc ayri alarm grubu bulunur:
- **Fiyat** (Ustu / Alti): mutlak bir fiyat esigi (orn. USD/TRY 35.00 ustune ciktiginda).
- **Yuzde** (% artis / % azalis): o ogenin gunluk degisim yuzdesi (`row-change` ile ayni deger) belirtilen esigi gectiginde (orn. %3 artis).
- **Oran**: izleme listenizdeki baska bir ogeyi "Karsilastirilacak oge" acilir kutusundan secip, bu ogenin fiyatinin secilen ogeye bolumunden elde edilen oranin (korelasyon orani) belirli bir esigin ustune/altina gectiginde uyar (orn. Altin/Dolar orani belli bir degerin ustune ciktiginda). Karsilastirilan oge izleme listesinden kaldirilirsa bu alarm otomatik olarak temizlenir.

Herhangi bir esige ulasildiginda Windows bildirimi (toast) gosterilir; esik asildiktan sonra deger tekrar esigin diger tarafina donup gelmeden ayni alarm bir daha tetiklenmez (yeniden "silahlanir"). Ana listede alarm tanimli ogelerin yaninda kucuk bir nokta gorunur.

**Genel alarm** (Ayarlar > Alarm): tek bir gunluk % artis/azalis esigi belirleyip, izleme listenizdeki **tum** ogelere aym anda uygulayabilirsiniz — her ogeye tek tek gitmeden. Bu, yukaridaki oge-bazli alarmlardan bagimsiz calisir; ikisi ayni oge icin birlikte de tanimlanabilir. Ornek: genel alarmda hem artis hem azalis esigini %5 yaparsaniz, izlenen herhangi bir oge gun icinde %5 veya daha fazla hareket ettiginde bildirim alirsiniz.

**Korelasyon cizgisi**: Izgara gorunumunde bir oge icin Oran alarmi kuruluysa, o oge ile karsilastirildigi ogenin kutulari arasinda ince, hareketli, kesikli bir cizgi belirir — iliskiyi ayarlara girmeden gorsel olarak takip edebilirsiniz. Baska bir gorunum moduna gecince cizgi kaybolur, Izgara'ya donunce alarmi yeniden kurmaya gerek kalmadan geri gelir.

## Piyasa nabzi (tepsi simgesi)

Ayarlar > Genel'de acik oldugunda (varsayilan acik), sistem tepsisindeki simge izlenen tum ogelerin ortalama gunluk degisim yuzdesine gore yesile veya kirmiziya doner (ortalama %0.3'un uzerinde/altinda kaldiginda); notrken mavi kalir. Pencereyi hic acmadan, goz ucuyla piyasanin genel havasini gorebilirsiniz.

## "Yokken neler oldu?" ozeti

Ana pencere en az 1 dakika gizli/simge durumunda kaldiktan sonra tekrar gosterildiginde, o sure icinde en cok hareket eden (en fazla %0.1 degisen) en fazla 3 oge icin bir Windows bildirimi belirir (orn. "USD/TRY +2.10%, BTC -4.80%"). 1 dakikadan kisa surelerde veya hicbir oge yeterince hareket etmediyse bildirim gosterilmez.

## Hizli bakis (global kisayol)

`Ctrl+Shift+Q` (Ayarlar > Genel'den kapatilabilir) herhangi bir uygulamadayken calisir: fare imlecinin yanında, favori ogelerinizin fiyat/degisim bilgisini gosteren kucuk, saydam bir pencere acar. Yaklasik 4.5 saniye sonra kendiliginden kapanir; erken kapatmak icin uzerine tiklamak veya kisayola tekrar basmak yeterlidir. Favori oge yoksa bunun yerine kisa bir bilgilendirme mesaji gosterilir.

## Portfoy (adet/maliyet) takibi

Bir ogeye adet ve ortalama maliyet girildiginde ana listede o satirin altinda anlik kar/zarar (tutar ve yuzde) gosterilir. Farkli para birimlerindeki ogeler arasinda toplam bir portfoy degeri hesaplanmaz (yanlis/yaniltici bir toplam vermemek icin) — her oge kendi para biriminde ayri gosterilir.

## Kur cevirici

Ust baslikdaki `⇄` butonu ile doviz/altin/gumus/platin kodlari arasinda miktar cevirebileceginiz kucuk bir hesap makinesi acilir (ABD borsasi/kripto bu cevirici disinda tutuldu, cunku onlarin fiyati zaten dogrudan USD olarak listede gorunuyor).

## Mini grafikler (sparkline)

ABD hisse/endeks ve kripto ogelerinin yaninda son donem fiyat hareketini gosteren kucuk bir çizgi grafik belirir (hisse/endeks: ~1 aylik gunluk kapanislar; kripto: ~7 gunluk saatlik veriler). Bu grafikler 10 dakikada bir guncellenir (fiyatlardan daha seyrek, cunku gecmis veri o kadar sik degismiyor ve API kotasini korumak icin). Doviz/altin icin ucretsiz bir gecmis veri kaynagi olmadigindan bu kategorilerde sparkline gosterilmez.

## Favoriler

Her satirin solunda beliren yildiz (`☆`/`★`) bir ogeyi favoriye ekler/cikarir. Ana pencerenin "★ Favoriler" sekmesine tiklayinca sadece favori isaretli ogeler listelenir. Favori durumu Ayarlar penceresindeki izleme listesinden de degistirilebilir.

## Pencere konumu hafizasi

Ana pencere, her ayri (mini) widget penceresi, ayarlar penceresi ve grafik penceresi kapatilip acildiginda (veya surukleyip birakildiginda) son birakildiklari konum ve boyutta acilir (`settings.json` icinde saklanir). Bir monitor sokulup cikarilmasi gibi durumlarda kayitli konum artik hicbir ekranda gorunmuyorsa (en az 40x40 piksel ortusme yoksa), uygulama bunu fark edip varsayilan bir konuma geri doner — boylece pencere "ekran disinda kayip" hale gelmez.

## Widget rengi

Ayarlar penceresinde bir ogenin "Detay" panelinden "Ozel renk" kutusu isaretlenip bir renk secilebilir. Bu renk ana listede o satirin sol kenarinda ince bir seritle, ayri (mini) penceredeyse o pencerenin ust basligi olarak gosterilir — boylece birden fazla ayri widget aciksa hangisinin hangi oge oldugu renkten de ayirt edilebilir.

## Gecmis grafik penceresi (1 yila kadar)

Her satirda beliren kucuk grafik simgesine tiklamak, o ogenin gecmis fiyat hareketini ayri, buyuk bir pencerede acar. Pencerenin ustunde 1G/1H/1A/3A/6A/1Y araligi secenekleri bulunur:
- **Hisse/Endeks (Yahoo Finance)**: 1G=1 gunluk 5 dakikalik, 1H=5 gunluk 30 dakikalik, 1A/3A/6A/1Y=gunluk kapanislar (1Y icin ~250 nokta).
- **Kripto (CoinGecko)**: gun sayisina gore otomatik cozunurluk (1Y icin ~365 gunluk nokta).
- **Doviz/Altin**: ucretsiz bir gecmis veri kaynagi olmadigindan bu pencere "gecmis veri bulunamiyor" mesaji gosterir (sparkline'daki ayni sinirlama).

Grafik penceresinin ust kisminda o anki fiyat ve secili aralik boyunca toplam degisim yuzdesi one cikan bir ozet olarak gosterilir. Grafigin kendisi alani boyayan bir dolgu, ince kilavuz cizgileri ve son noktayi vurgulayan bir nokta ile cizilir; fare ile uzerine gelince o noktanin tarihi/fiyati ve baslangica gore yuzde degisimi bir ipucu kutusunda gorunur. **Iki nokta arasindaki artisi/azalisi yuzde olarak olcmek icin** grafik uzerinde bir noktadan diger noktaya suruklemeniz yeterli — secili araligi vurgulayan bir bant ve o iki nokta arasindaki yuzde + mutlak fark + tarih araligini gosteren bir rozet belirir; rozet fareyi birakinca da ekranda kalir, temizlemek icin bos bir yere tiklamak veya `Esc` tusuna basmak yeterlidir.

## Haber ozeti

Ust baslikta beliren gazete simgesine tiklamak, borsa/doviz/altin/ekonomi/kripto ile ilgili son haberleri listeleyen bir panel acar (Google Haberler RSS - ucretsiz, API anahtari gerekmez). Basliga tiklamak haberi varsayilan tarayicida acar. Panel 10 dakikada bir onbelleklenir; ust bardaki yenile butonu zorla tazeler.

## Bilinen sinirlamalar

- Bu ortamda (sandboxed dev container) gercek bir Windows masaustu ekrani goruntulenemediginden pencerelerin gorsel ciktisi (renkler, hizalama, grafik olcekleme) pixel-pixel test edilemedi; veri katmani ve tum IPC akislari (favoriler, renk, alarm, portfoy, grafik, cevirici) canli uc noktalara ve coklu pencere acilisina karsi dogrulandi (main+ayarlar+mini+grafik penceresi ayni anda hatasiz acildi). Kendi makinenizde `npm start` ile gorsel ince ayari siz yapabilirsiniz.
- `assets/icon.png` ve `assets/tray.png` yer tutucu (placeholder) ikonlardir; `assets/generate-icons.js` ile uretilmislerdir. Gercek bir logo ile degistirebilirsiniz.
