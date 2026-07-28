# Mini Takip

Doviz, altin, ABD borsasi (hisse/endeks) ve kripto para takibi icin Electron tabanli, sistem tepsisinde yasayan bir masaustu widget'i.

## Calistirma

```bash
npm install
npm start
```

`npm start` once TypeScript kaynaklarini `dist/` altina derler, sonra Electron'u baslatir. Pencere ekranin sag ust kosesinde, her zaman ustte, cerceve olmadan acilir. Sistem tepsisinde bir simge belirir; sag tik menusunden goster/gizle, simdi yenile, Windows ile baslat ve cikis secenekleri bulunur.

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

Uygulama acilista ve Ayarlar > Guncelleme bolumunden manuel olarak GitHub Releases uzerinden yeni surum kontrolu yapar (`electron-updater`). Bunun calismasi icin:

1. `package.json` > `build.publish` altindaki `owner`/`repo` alanlarini kendi GitHub kullanici adiniz ve repo isminizle degistirin.
2. Kodu bir GitHub reposuna push'layin (henuz bir git deposu yok; `git init` ile baslayabilirsiniz).
3. Yeni bir surum yayinlamak icin: `GH_TOKEN=<kisisel-erisim-tokeniniz> npm run release` — bu, `dist/` altinda kurulum dosyalarini uretir VE GitHub Releases'e otomatik yukler (`latest.yml` dahil, electron-updater'in kontrol ettigi dosya).
4. Kullanicidaki eski surumler acilista veya "Guncellemeleri kontrol et" ile bu Release'i bulup arka planda indirir; "Yeniden baslat ve guncelle" butonuna basildiginda kurulup uygulama yeniden baslar.

Paketlenmemis (gelistirme) modda "Guncellemeleri kontrol et" butonu bilgilendirici bir mesaj gosterir, hata vermez — auto-update sadece `npm run pack`/`npm run release` ile paketlenmis kurulumlarda calisir.

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

Miknatis acikken (varsayilan: acik) herhangi bir Mini Takip penceresini (ana pencere, mini pencereler, ayarlar) suruklerken ekran kenarlarina veya diger Mini Takip pencerelerinin kenarlarina ~16px yaklastiginda pencere otomatik olarak o kenara yapisir. Ayarlar penceresinden acilip kapatilabilir.

## Gorunumler

Ana pencerenin dis bardaki disli (⚙) simgesinden Ayarlar penceresi acilir; buradan **Liste** (varsayilan, detayli satirlar), **Kompakt** (dar satirlar, kategori etiketi gizli) veya **Izgara** (2 sutunlu kart gorunumu) secilebilir; degisiklik aninda ana pencereye yansir.

## Ayarlar penceresi

Ana pencere basligindaki disli simgesinden acilir. Tek bir yerden yonetilebilenler:
- Yenileme araligi (saniye)
- Windows ile baslatma
- Miknatis acik/kapali
- Genel kisayol acik/kapali (`Ctrl+Shift+M` ile goster/gizle, her yerden calisir)
- Gorunum modu (Liste/Kompakt/Izgara) ve tema (Koyu/Acik)
- Izleme listesindeki her oge icin "Detay" altinda: portfoy (adet + ortalama maliyet) ve fiyat alarmi (ustu/alti), ayri pencerede goster/kapat, listeden kaldir

Izleme listesi ve ayarlar `%APPDATA%/Mini Takip/` altinda `watchlist.json` ve `settings.json` olarak saklanir (mini pencerelerin konum/boyutlari da `settings.json` icinde `detachedWindows` altinda tutulur).

## Kategori sekmeleri ve siralama

Ana pencerede liste ustunde Tumu/Doviz/Altin/Hisse/Endeks/Kripto sekmeleri ile filtreleme yapilabilir. Satirlar surukle-birak ile yeniden siralanabilir (fare ile bir satiri tutup baska bir satirin uzerine birakmak yeterlidir); siralama kalicidir.

## Fiyat alarmlari

Ayarlar penceresinde bir ogenin "Detay" panelinden "Alarm ustu"/"Alarm alti" degerleri girilebilir. Fiyat o esige ulastiginda Windows bildirimi (toast) gosterilir; fiyat esigin diger tarafina donup tekrar gelene kadar ayni alarm bir daha tetiklenmez (yeniden "silahlanir"). Ana listede alarm tanimli ogelerin yaninda kucuk bir nokta gorunur.

## Portfoy (adet/maliyet) takibi

Bir ogeye adet ve ortalama maliyet girildiginde ana listede o satirin altinda anlik kar/zarar (tutar ve yuzde) gosterilir. Farkli para birimlerindeki ogeler arasinda toplam bir portfoy degeri hesaplanmaz (yanlis/yaniltici bir toplam vermemek icin) — her oge kendi para biriminde ayri gosterilir.

## Kur cevirici

Ust baslikdaki `⇄` butonu ile doviz/altin/gumus/platin kodlari arasinda miktar cevirebileceginiz kucuk bir hesap makinesi acilir (ABD borsasi/kripto bu cevirici disinda tutuldu, cunku onlarin fiyati zaten dogrudan USD olarak listede gorunuyor).

## Mini grafikler (sparkline)

ABD hisse/endeks ve kripto ogelerinin yaninda son donem fiyat hareketini gosteren kucuk bir çizgi grafik belirir (hisse/endeks: ~1 aylik gunluk kapanislar; kripto: ~7 gunluk saatlik veriler). Bu grafikler 10 dakikada bir guncellenir (fiyatlardan daha seyrek, cunku gecmis veri o kadar sik degismiyor ve API kotasini korumak icin). Doviz/altin icin ucretsiz bir gecmis veri kaynagi olmadigindan bu kategorilerde sparkline gosterilmez.

## Favoriler

Her satirin solunda beliren yildiz (`☆`/`★`) bir ogeyi favoriye ekler/cikarir. Favoriler ana listede "★ Favoriler" basligi altinda her zaman en ustte, geri kalanlar "Tumu" basligi altinda gosterilir (aktif bir kategori sekmesi secili olsa bile favoriler o kategori icinde yine en usttedir). Favori durumu Ayarlar penceresindeki izleme listesinden de degistirilebilir.

## Pencere konumu hafizasi

Ana pencere ve her ayri (mini) widget penceresi kapatilip acildiginda son birakildiklari konum ve boyutta acilir (`settings.json` icinde saklanir). Bir monitor sokulup cikarilmasi gibi durumlarda kayitli konum artik hicbir ekranda gorunmuyorsa (en az 40x40 piksel ortusme yoksa), uygulama bunu fark edip varsayilan bir konuma geri doner — boylece pencere "ekran disinda kayip" hale gelmez.

## Widget rengi

Ayarlar penceresinde bir ogenin "Detay" panelinden "Ozel renk" kutusu isaretlenip bir renk secilebilir. Bu renk ana listede o satirin sol kenarinda ince bir seritle, ayri (mini) penceredeyse o pencerenin ust basligi olarak gosterilir — boylece birden fazla ayri widget aciksa hangisinin hangi oge oldugu renkten de ayirt edilebilir.

## Gecmis grafik penceresi (1 yila kadar)

Her satirda beliren kucuk grafik simgesine tiklamak, o ogenin gecmis fiyat hareketini ayri, buyuk bir pencerede acar. Pencerenin ustunde 1G/1H/1A/3A/6A/1Y araligi secenekleri bulunur:
- **Hisse/Endeks (Yahoo Finance)**: 1G=1 gunluk 5 dakikalik, 1H=5 gunluk 30 dakikalik, 1A/3A/6A/1Y=gunluk kapanislar (1Y icin ~250 nokta).
- **Kripto (CoinGecko)**: gun sayisina gore otomatik cozunurluk (1Y icin ~365 gunluk nokta).
- **Doviz/Altin**: ucretsiz bir gecmis veri kaynagi olmadigindan bu pencere "gecmis veri bulunamiyor" mesaji gosterir (sparkline'daki ayni sinirlama).

## Haber ozeti

Ust baslikta beliren gazete simgesine tiklamak, borsa/doviz/altin/ekonomi/kripto ile ilgili son haberleri listeleyen bir panel acar (Google Haberler RSS - ucretsiz, API anahtari gerekmez). Basliga tiklamak haberi varsayilan tarayicida acar. Panel 10 dakikada bir onbelleklenir; ust bardaki yenile butonu zorla tazeler.

## Bilinen sinirlamalar

- Bu ortamda (sandboxed dev container) gercek bir Windows masaustu ekrani goruntulenemediginden pencerelerin gorsel ciktisi (renkler, hizalama, grafik olcekleme) pixel-pixel test edilemedi; veri katmani ve tum IPC akislari (favoriler, renk, alarm, portfoy, grafik, cevirici) canli uc noktalara ve coklu pencere acilisina karsi dogrulandi (main+ayarlar+mini+grafik penceresi ayni anda hatasiz acildi). Kendi makinenizde `npm start` ile gorsel ince ayari siz yapabilirsiniz.
- `assets/icon.png` ve `assets/tray.png` yer tutucu (placeholder) ikonlardir; `assets/generate-icons.js` ile uretilmislerdir. Gercek bir logo ile degistirebilirsiniz.
