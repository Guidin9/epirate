# Chrome Web Store'a yükleme rehberi

Bu klasördeki her şey mağaza panelinde ([Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)) doldurulacak alanlar için hazırlandı. Panele yapıştırılacak metinler İngilizce bırakıldı; inceleme ekibi İngilizce okuyor.

## 0. Hazırlık

```bash
npm run check          # sözdizimi + manifest + 12 dil dosyası
npm test               # birim testleri
npm run test:e2e       # uçtan uca testler (görünmez Chrome)
npm run package        # → dist/epirate-<sürüm>.zip  (manifest'teki "key" alanı otomatik çıkarılır)
```

Görselleri ya da metinleri yeniden üretmek için: `npm run store:assets` (12 dil × 4 ekran görüntüsü + tanıtım görselleri) ve `npm run store:texts`.

## 1. Geliştirici hesabı

- Panelde bir kerelik **5 ABD doları** kayıt ücreti ödenir.
- İletişim e-postası doğrulanır.
- AB'deki "tüccar" (trader) beyanında, eklentiyi ücretsiz ve ticari olmayan bir proje olarak yayımladığın için **non-trader** seçilebilir.

## 2. Paketi yükle

**Items › New item** → `dist/epirate-1.1.0.zip`

## 3. Store listing (Mağaza sayfası)

| Alan | Değer |
|---|---|
| Description | `store/listing/<dil>.md` → "Description" bölümü. Önce **English** (varsayılan), sonra diğer 11 dil için **Add language** ile ekle. Ad ve kısa açıklama manifest'ten otomatik gelir. |
| Category | **Entertainment** |
| Language | English (varsayılan) |
| Store icon | `extension/icons/icon128.png` |
| Screenshots | `store/screenshots/<dil>/1-badge.png … 4-settings.png` (1280×800). Her dilin kendi görüntülerini o dilin sayfasına yükle. |
| Small promo tile | `store/promo/small-tile-440x280.png` |
| Marquee promo tile | `store/promo/marquee-1400x560.png` (isteğe bağlı) |
| Official URL | boş bırak |
| Homepage URL | `https://github.com/Guidin9/epirate` |
| Support URL | `https://github.com/Guidin9/epirate/issues` |

Not: İngilizce ve Türkçe ekran görüntüleri depoda; diğer diller yerelde `npm run store:assets` ile üretilir (depoyu şişirmemek için git dışında).

## 4. Privacy practices (Gizlilik sekmesi)

**Single purpose description**

```
EpiRate shows the IMDb rating of the Prime Video episode or movie the user is watching, in the player and in the series episode list.
```

**Permission justifications**

| İzin | Gerekçe (yapıştır) |
|---|---|
| `storage` | `Stores the user's settings, manual title corrections and a local cache of ratings so lookups are fast and not repeated.` |
| `scripting` | `Starts EpiRate in Prime Video tabs that were already open when the extension is installed, updated or re-enabled, so users don't have to reload the page they are watching.` |
| Host `https://*.primevideo.com/*` | `Reads the show title and season/episode number shown by the Prime Video player and series pages, and displays the rating badge and episode list ratings on those pages.` |
| Host `https://v3.sg.media-imdb.com/*`, `https://*.graphql.imdb.com/*` | `Looks up the show on IMDb and retrieves its episode ratings.` |

**Remote code:** `No, I am not using remote code.`

**Data usage**
- İşaretle: **Website content**. Prime Video sayfasında görünen dizi/film adı, puanı bulmak için IMDb'ye gönderiliyor.
- Diğer kategorilerin hiçbiri işaretlenmez.
- Alttaki üç beyanın üçü de işaretlenir: veri satılmıyor, ilgisiz amaçlarla kullanılmıyor, kredi değerlendirmesi için kullanılmıyor.

**Privacy policy URL:** `https://github.com/Guidin9/epirate/blob/main/PRIVACY.md`

## 5. Distribution

- Visibility: **Public**
- Regions: **All regions**

## 6. İnceleme ekibine not (Submit ekranındaki "notes" alanı)

```
No account is needed to test the episode list ratings: open any Prime Video series page, e.g.
https://www.primevideo.com/detail/0KRGHGZCHKS920ZQGY5LBRF7MA — every episode shows its IMDb rating.
The in-player badge appears while an episode plays (requires a Prime Video subscription).
The extension sends only the title being watched to IMDb; nothing is sent to the developer.
```

## Bilinmesi gerekenler

- **IMDb kullanım şartları:** IMDb'nin bu servisi yanıtında herkese açık kullanıma izin vermediğini yazıyor. Eklenti ücretsiz ve ticari değil; buna rağmen IMDb şikâyet ederse mağazadan kaldırılma ya da servisin kapanması riski var. Gerekirse veri kaynağı OMDb'ye çevrilebilir.
- **Marka:** Ad ve simgede IMDb/Amazon markası yok. Açıklamalarda "bağlantılı değildir" notu var. Rozetteki sarı IMDb etiketi puanın kaynağını belirtiyor; inceleme itiraz ederse nötr etikete geçmek birkaç dakikalık bir iş.
- **Güncelleme:** `extension/manifest.json` içindeki `version`'ı artır → `npm run package` → panelde **Package › Upload new package**.
