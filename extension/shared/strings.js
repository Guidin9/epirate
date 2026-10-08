// Arayüz metinleri ve sayı biçimlendirme (Türkçe).
(function (root, factory) {
  const api = factory(root);
  root.PVIMDB = Object.assign(root.PVIMDB || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const T = {
    loading: 'Puan aranıyor…',
    noRating: 'Henüz puan yok',
    notFound: "IMDb'de bulunamadı",
    episodeNotFound: "Bölüm IMDb'de yok",
    error: 'IMDb’ye ulaşılamadı',
    retry: 'Tekrar dene',
    votes: 'oy',
    series: 'Dizi',
    season: 'Sezon',
    episode: 'Bölüm',
    seasonShort: 'S',
    episodeShort: 'B',
    openImdb: "IMDb'de aç",
    openSeries: 'Dizi sayfası',
    seasonChart: 'Sezon puanları',
    current: 'şu an',
    wrongMatch: 'Yanlış dizi mi? Araç çubuğundaki eklenti simgesinden düzeltebilirsin.',
    matchedByTitle: 'Bölüm adıyla eşleştirildi',
    matchedByOverride: 'Elle seçilen eşleşme',
    close: 'Kapat',
    badgeLabel: 'IMDb puanı',
    movie: 'Film',
  };

  const ratingFormat = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const compactFormat = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

  /** 8.3 → "8,3" */
  function formatRating(value) {
    return typeof value === 'number' && isFinite(value) ? ratingFormat.format(value) : '—';
  }

  /** 30456 → "30 B", 1030190 → "1 Mn" */
  function formatVotes(value) {
    return typeof value === 'number' && value > 0 ? compactFormat.format(value) : '0';
  }

  /** "2019-07-26" → "26 Tem 2019" */
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Puan bandına göre renk (sezon grafiği ve liste etiketleri için). */
  function ratingTier(value) {
    if (typeof value !== 'number') return 'none';
    if (value >= 8.5) return 'great';
    if (value >= 7.5) return 'good';
    if (value >= 6.5) return 'ok';
    return 'low';
  }

  return { T, formatRating, formatVotes, formatDate, ratingTier };
});
