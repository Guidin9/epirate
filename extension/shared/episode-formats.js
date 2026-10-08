// BU DOSYA OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Yenilemek için: npm run sync:prime
// Kaynak: Prime Video web oynatıcısının dil dosyaları (https://cloudfront.xp-assets.aiv-cdn.net/family/web/ATVWebPlayerSDK-1.0/prod/languages/<dil>.json)
// Üretim tarihi: 2026-10-08
(function (root) {
  'use strict';
  const EPISODE_FORMATS = {
    "ar-AE": {
      "long": "الموسم {{seasonNumber}}، الحلقة {{episodeNumber}}",
      "seasonShort": "الموسم",
      "episodeShort": "الحلقة"
    },
    "cs-CZ": {
      "long": "Řada {{seasonNumber}}, ep. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "da-DK": {
      "long": "Sæson {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "de-DE": {
      "long": "Staffel {{seasonNumber}}, F. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "F"
    },
    "el-GR": {
      "long": "Κύκλος επεισοδίων {{seasonNumber}}, Επ. {{episodeNumber}}",
      "seasonShort": "Σ",
      "episodeShort": "E"
    },
    "en-GB": {
      "long": "Season {{seasonNumber}}, Ep. {{episodeNumber}} ",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "en-US": {
      "long": "Season {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "es-ES": {
      "long": "Temporada {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "T",
      "episodeShort": "E"
    },
    "es-US": {
      "long": "Temporada {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "T",
      "episodeShort": "E"
    },
    "fi-FI": {
      "long": "Kausi {{seasonNumber}}, jakso {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "fil-PH": {
      "long": "Season {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "fr-FR": {
      "long": "Saison {{seasonNumber}}, ép. {{episodeNumber}}",
      "seasonShort": "S.",
      "episodeShort": "Ép."
    },
    "he-IL": {
      "long": "עונה {{seasonNumber}}, פרק {{episodeNumber}}",
      "seasonShort": "עונה‎ S ",
      "episodeShort": "פרק ‎ E"
    },
    "hi-IN": {
      "long": "सीज़न {{seasonNumber}}, एपि. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "hu-HU": {
      "long": "{{seasonNumber}}. évad, {{episodeNumber}}. epizód",
      "seasonShort": "évad",
      "episodeShort": "epizód"
    },
    "id-ID": {
      "long": "Season {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "it-IT": {
      "long": "Stagione {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "ja-JP": {
      "long": "シーズン{{seasonNumber}}、エピソード{{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "ko-KR": {
      "long": "시즌 {{seasonNumber}}, 에피소드 {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "ms-MY": {
      "long": "Musim {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "M",
      "episodeShort": "E"
    },
    "nb-NO": {
      "long": "Sesong {{seasonNumber}}, ep. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "nl-NL": {
      "long": "Seizoen {{seasonNumber}}, aflevering {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "Afl."
    },
    "pl-PL": {
      "long": "Sezon {{seasonNumber}}, odc. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "O"
    },
    "pt-BR": {
      "long": "Temporada {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "T",
      "episodeShort": "Ep."
    },
    "pt-PT": {
      "long": "Temporada {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "T",
      "episodeShort": "E"
    },
    "ro-RO": {
      "long": "Sezonul {{seasonNumber}}, Ep. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "ru-RU": {
      "long": "Сезон {{seasonNumber}}, эпизод {{episodeNumber}}",
      "seasonShort": "С.",
      "episodeShort": "Эп."
    },
    "sv-SE": {
      "long": "Säsong {{seasonNumber}}, avsnitt {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "A"
    },
    "ta-IN": {
      "long": "சீசன் {{seasonNumber}}, எப்பி. {{episodeNumber}}",
      "seasonShort": "சீ",
      "episodeShort": "எ"
    },
    "te-IN": {
      "long": "సీజన్ {{seasonNumber}}, ఎపి. {{episodeNumber}}",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "th-TH": {
      "long": "ซีซัน {{seasonNumber}} ตอน {{episodeNumber}}",
      "seasonShort": "ซีซัน",
      "episodeShort": "ตอน"
    },
    "tr-TR": {
      "long": "{{seasonNumber}}. Sezon {{episodeNumber}} Bölüm",
      "seasonShort": "S",
      "episodeShort": "E"
    },
    "zh-CN": {
      "long": "第 {{seasonNumber}} 季，第 {{episodeNumber}} 集",
      "seasonShort": "季",
      "episodeShort": "集"
    },
    "zh-TW": {
      "long": "第 {{seasonNumber}} 季第 {{episodeNumber}} 集",
      "seasonShort": "S",
      "episodeShort": "E"
    }
  };
  root.PVIMDB = Object.assign(root.PVIMDB || {}, { EPISODE_FORMATS });
  if (typeof module === 'object' && module.exports) module.exports = { EPISODE_FORMATS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
