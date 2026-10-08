// Chrome Web Store mağaza metinleri (12 dil). store/listing/<dil>.md bu dosyadan üretilir: npm run store:texts
// {BADGE} her dilde o dilin sayı biçimiyle örnek rozete dönüşür.

export const SUPPORT_EMAIL = 'contact@mertdemirdoven.me';

export const CAPTIONS = {
  // Mağaza ekran görüntülerinin başlıkları: [rozet, panel, bölüm listesi, ayarlar]
  en: ["The episode's IMDb rating, right under the title", 'Click for the whole season — no spoilers', 'Ratings in the episode list, before you press play', 'Your way: when, where, how big — in 12 languages'],
  tr: ['Bölümün IMDb puanı, başlığın hemen altında', 'Tıkla, tüm sezonu gör — spoiler yok', 'Oynatmadan önce bölüm listesinde puanlar', 'Senin tercihin: ne zaman, nerede, ne büyüklükte — 12 dilde'],
  de: ['Die IMDb-Bewertung der Episode, direkt unter dem Titel', 'Ein Klick zeigt die ganze Staffel – ohne Spoiler', 'Bewertungen in der Episodenliste, noch vor dem Abspielen', 'Ganz nach deinem Geschmack – in 12 Sprachen'],
  es: ['La puntuación de IMDb del episodio, justo bajo el título', 'Haz clic y mira toda la temporada, sin spoilers', 'Puntuaciones en la lista de episodios antes de darle a reproducir', 'A tu manera: cuándo, dónde y de qué tamaño, en 12 idiomas'],
  fr: ["La note IMDb de l'épisode, juste sous le titre", 'Un clic pour toute la saison — sans spoilers', 'Les notes dans la liste des épisodes, avant de lancer la lecture', 'À votre façon : quand, où et en quelle taille — en 12 langues'],
  it: ["Il voto IMDb dell'episodio, proprio sotto il titolo", "Un clic per l'intera stagione, senza spoiler", "Voti nell'elenco degli episodi, prima di premere play", 'Come preferisci: quando, dove e quanto grande, in 12 lingue'],
  pt_BR: ['A nota do IMDb do episódio, logo abaixo do título', 'Clique e veja a temporada inteira, sem spoilers', 'Notas na lista de episódios antes de dar play', 'Do seu jeito: quando, onde e em que tamanho, em 12 idiomas'],
  pl: ['Ocena IMDb odcinka tuż pod tytułem', 'Kliknij i zobacz cały sezon – bez spoilerów', 'Oceny na liście odcinków, zanim naciśniesz „odtwórz”', 'Po Twojemu: kiedy, gdzie i jak duże – w 12 językach'],
  nl: ['De IMDb-score van de aflevering, direct onder de titel', 'Klik voor het hele seizoen – zonder spoilers', 'Scores in de afleveringenlijst, nog voor je op afspelen drukt', 'Zoals jij wilt: wanneer, waar en hoe groot – in 12 talen'],
  ja: ['エピソードの IMDb 評価をタイトルのすぐ下に', 'クリックでシーズン全体をチェック（ネタバレなし）', '再生前にエピソード一覧で評価を確認', '表示タイミング・位置・サイズを自由に。12 言語対応'],
  hi: ['एपिसोड की IMDb रेटिंग, ठीक शीर्षक के नीचे', 'क्लिक करें और पूरा सीज़न देखें — बिना स्पॉइलर', 'प्ले दबाने से पहले एपिसोड सूची में रेटिंग', 'आपके हिसाब से: कब, कहाँ और कितना बड़ा — 12 भाषाओं में'],
  ar: ['تقييم IMDb للحلقة أسفل العنوان مباشرةً', 'انقر لترى الموسم كاملًا — بلا حرق للأحداث', 'التقييمات في قائمة الحلقات قبل التشغيل', 'كما تحب: متى وأين وبأي حجم — بـ 12 لغة'],
};

export const DESCRIPTIONS = {
  en: `EpiRate shows the IMDb rating of the episode you're watching on Prime Video — right in the player, without leaving fullscreen.

WHAT YOU GET
• The episode's rating under the show title: {BADGE}. It appears and fades with the player controls, so nothing covers the picture while you watch.
• Click the badge to see the whole season at a glance: a mini chart of every episode's rating. Titles of upcoming episodes stay hidden — no spoilers.
• Ratings in the episode list on series pages, before you press play.
• Movie ratings, and the current rating on the toolbar icon.
• Updates automatically when the next episode starts; works in fullscreen.
• Finds the right show even with localized titles. Wrong match? Fix it in two clicks — your choice is remembered.
• Choose when it shows (with the controls, at episode start, or always), where and how big. Alt+Shift+I hides it.
• Reads Prime Video in 34 languages; interface in 12 languages.

COMING SOON
Support for more streaming platforms is on the way in upcoming versions.

PRIVACY
No account, no ads, no tracking. EpiRate only sends the title you're watching to IMDb to look up its rating; results are cached on your device.

Found a bug or have a suggestion? Use "Report a bug / Contact" in the extension or write to {EMAIL}.

EpiRate is an independent project and is not affiliated with or endorsed by IMDb or Amazon. IMDb and Prime Video are trademarks of their respective owners.`,

  tr: `EpiRate, Prime Video'da izlediğin bölümün IMDb puanını oynatıcının içinde, tam ekrandan çıkmadan gösterir.

NELER VAR
• Dizi adının altında bölümün puanı: {BADGE}. Oynatıcının kontrolleriyle birlikte görünür ve kaybolur; izlerken görüntünün üstünde hiçbir şey kalmaz.
• Rozete tıkla, sezonun tamamını tek bakışta gör: her bölümün puanını gösteren mini grafik. Sonraki bölümlerin adları gizli — spoiler yok.
• Dizi sayfalarındaki bölüm listesinde puanlar: oynatmadan önce gör.
• Film puanları ve araç çubuğu simgesinde o anki puan.
• Sonraki bölüm başlayınca kendiliğinden güncellenir; tam ekranda çalışır.
• Türkçe gibi yerel adlarla da doğru diziyi bulur. Yanlış eşleşme mi? İki tıkla düzelt — seçimin hatırlanır.
• Ne zaman (kontrollerle, bölüm başında ya da hep), nerede ve ne büyüklükte görüneceğini sen seç. Alt+Shift+I ile gizle.
• Prime Video'yu 34 dilde okur; arayüz 12 dilde.

YAKINDA
Gelecek sürümlerde diğer yayın platformlarına da destek geliyor.

GİZLİLİK
Hesap yok, reklam yok, takip yok. EpiRate yalnızca izlediğin içeriğin adını, puanını bulmak için IMDb'ye gönderir; sonuçlar cihazında önbelleğe alınır.

Hata mı buldun, önerin mi var? Eklentideki "Hata bildir / İletişim" düğmesini kullan ya da {EMAIL} adresine yaz.

EpiRate bağımsız bir projedir; IMDb veya Amazon ile bağlantılı değildir ve onlar tarafından desteklenmez. IMDb ve Prime Video, sahiplerinin ticari markalarıdır.`,

  de: `EpiRate zeigt die IMDb-Bewertung der Episode, die du gerade auf Prime Video schaust – direkt im Player, ohne den Vollbildmodus zu verlassen.

DAS BEKOMMST DU
• Die Episodenbewertung unter dem Serientitel: {BADGE}. Sie erscheint und verschwindet zusammen mit der Player-Steuerung – beim Schauen verdeckt nichts das Bild.
• Ein Klick auf das Abzeichen zeigt die ganze Staffel auf einen Blick: ein Mini-Diagramm mit der Bewertung jeder Episode. Titel kommender Episoden bleiben verborgen – keine Spoiler.
• Bewertungen in der Episodenliste auf Serienseiten, schon vor dem Abspielen.
• Bewertungen für Filme und die aktuelle Bewertung am Symbol in der Symbolleiste.
• Aktualisiert sich automatisch, wenn die nächste Episode startet; funktioniert im Vollbild.
• Findet die richtige Serie auch bei übersetzten Titeln. Falsch zugeordnet? Mit zwei Klicks korrigiert – deine Wahl wird gespeichert.
• Du entscheidest, wann (mit der Steuerung, zu Episodenbeginn oder immer), wo und wie groß es erscheint. Alt+Shift+I blendet es aus.
• Liest Prime Video in 34 Sprachen; Oberfläche in 12 Sprachen.

DEMNÄCHST
Unterstützung für weitere Streaming-Plattformen folgt in kommenden Versionen.

DATENSCHUTZ
Kein Konto, keine Werbung, kein Tracking. EpiRate sendet nur den Titel dessen, was du schaust, an IMDb, um die Bewertung nachzuschlagen; die Ergebnisse werden auf deinem Gerät zwischengespeichert.

Fehler gefunden oder einen Vorschlag? Nutze „Fehler melden / Kontakt“ in der Erweiterung oder schreib an {EMAIL}.

EpiRate ist ein unabhängiges Projekt und steht in keiner Verbindung zu IMDb oder Amazon. IMDb und Prime Video sind Marken ihrer jeweiligen Inhaber.`,

  es: `EpiRate muestra la puntuación de IMDb del episodio que estás viendo en Prime Video, directamente en el reproductor y sin salir de la pantalla completa.

QUÉ OFRECE
• La puntuación del episodio bajo el título de la serie: {BADGE}. Aparece y desaparece junto con los controles del reproductor, así que nada tapa la imagen mientras ves.
• Haz clic en la insignia para ver toda la temporada de un vistazo: un minigráfico con la puntuación de cada episodio. Los títulos de los próximos episodios se ocultan: sin spoilers.
• Puntuaciones en la lista de episodios de cada serie, antes de darle a reproducir.
• Puntuaciones de películas y la puntuación actual en el icono de la barra de herramientas.
• Se actualiza solo cuando empieza el siguiente episodio y funciona en pantalla completa.
• Encuentra la serie correcta incluso con títulos traducidos. ¿Coincidencia equivocada? Se corrige en dos clics y se recuerda tu elección.
• Tú eliges cuándo se muestra (con los controles, al inicio del episodio o siempre), dónde y de qué tamaño. Alt+Shift+I la oculta.
• Lee Prime Video en 34 idiomas; interfaz en 12 idiomas.

PRÓXIMAMENTE
En las próximas versiones llegará la compatibilidad con más plataformas de streaming.

PRIVACIDAD
Sin cuenta, sin anuncios, sin rastreo. EpiRate solo envía a IMDb el título de lo que estás viendo para consultar su puntuación; los resultados se guardan en caché en tu dispositivo.

¿Has encontrado un error o tienes una sugerencia? Usa «Informar de un error / Contacto» en la extensión o escribe a {EMAIL}.

EpiRate es un proyecto independiente y no está afiliado a IMDb ni a Amazon ni cuenta con su respaldo. IMDb y Prime Video son marcas comerciales de sus respectivos propietarios.`,

  fr: `EpiRate affiche la note IMDb de l'épisode que vous regardez sur Prime Video, directement dans le lecteur, sans quitter le plein écran.

CE QUE VOUS OBTENEZ
• La note de l'épisode sous le titre de la série : {BADGE}. Elle apparaît et disparaît avec les commandes du lecteur : rien ne masque l'image pendant que vous regardez.
• Cliquez sur le badge pour voir toute la saison d'un coup d'œil : un mini-graphique avec la note de chaque épisode. Les titres des épisodes à venir restent masqués — pas de spoilers.
• Les notes dans la liste des épisodes des pages de série, avant même de lancer la lecture.
• Les notes des films et la note en cours sur l'icône de la barre d'outils.
• Mise à jour automatique au lancement de l'épisode suivant ; fonctionne en plein écran.
• Trouve la bonne série même avec des titres traduits. Mauvaise correspondance ? Corrigée en deux clics, et votre choix est mémorisé.
• Choisissez quand l'afficher (avec les commandes, au début de l'épisode ou toujours), où et en quelle taille. Alt+Maj+I le masque.
• Lit Prime Video en 34 langues ; interface en 12 langues.

BIENTÔT
La prise en charge d'autres plateformes de streaming arrive dans les prochaines versions.

CONFIDENTIALITÉ
Pas de compte, pas de publicité, pas de suivi. EpiRate envoie uniquement à IMDb le titre de ce que vous regardez pour trouver sa note ; les résultats sont mis en cache sur votre appareil.

Un bug ou une suggestion ? Utilisez « Signaler un bug / Contact » dans l'extension ou écrivez à {EMAIL}.

EpiRate est un projet indépendant, sans lien avec IMDb ni Amazon et non approuvé par eux. IMDb et Prime Video sont des marques de leurs propriétaires respectifs.`,

  it: `EpiRate mostra il voto IMDb dell'episodio che stai guardando su Prime Video, direttamente nel player e senza uscire dallo schermo intero.

COSA OFFRE
• Il voto dell'episodio sotto il titolo della serie: {BADGE}. Compare e scompare insieme ai controlli del player, così niente copre l'immagine mentre guardi.
• Fai clic sul badge per vedere l'intera stagione a colpo d'occhio: un mini grafico con il voto di ogni episodio. I titoli degli episodi successivi restano nascosti: niente spoiler.
• Voti nell'elenco degli episodi delle pagine delle serie, prima di premere play.
• Voti dei film e il voto attuale sull'icona della barra degli strumenti.
• Si aggiorna da solo quando parte l'episodio successivo; funziona a schermo intero.
• Trova la serie giusta anche con titoli tradotti. Abbinamento errato? Si corregge in due clic e la tua scelta viene ricordata.
• Scegli quando mostrarlo (con i controlli, all'inizio dell'episodio o sempre), dove e quanto grande. Alt+Maiusc+I lo nasconde.
• Legge Prime Video in 34 lingue; interfaccia in 12 lingue.

IN ARRIVO
Il supporto per altre piattaforme di streaming arriverà nelle prossime versioni.

PRIVACY
Nessun account, nessuna pubblicità, nessun tracciamento. EpiRate invia a IMDb solo il titolo di ciò che stai guardando per trovarne il voto; i risultati vengono salvati nella cache del tuo dispositivo.

Hai trovato un bug o hai un suggerimento? Usa «Segnala un bug / Contatti» nell'estensione o scrivi a {EMAIL}.

EpiRate è un progetto indipendente, non affiliato né approvato da IMDb o Amazon. IMDb e Prime Video sono marchi dei rispettivi proprietari.`,

  pt_BR: `O EpiRate mostra a nota do IMDb do episódio que você está assistindo no Prime Video, direto no player e sem sair da tela cheia.

O QUE VOCÊ GANHA
• A nota do episódio abaixo do título da série: {BADGE}. Ela aparece e some junto com os controles do player, então nada cobre a imagem enquanto você assiste.
• Clique no selo para ver a temporada inteira de relance: um minigráfico com a nota de cada episódio. Os títulos dos próximos episódios ficam ocultos — sem spoilers.
• Notas na lista de episódios das páginas de séries, antes de dar play.
• Notas de filmes e a nota atual no ícone da barra de ferramentas.
• Atualiza sozinho quando o próximo episódio começa; funciona em tela cheia.
• Encontra a série certa mesmo com títulos traduzidos. Correspondência errada? Corrija em dois cliques — sua escolha fica salva.
• Escolha quando aparece (com os controles, no início do episódio ou sempre), onde e em que tamanho. Alt+Shift+I oculta.
• Lê o Prime Video em 34 idiomas; interface em 12 idiomas.

EM BREVE
O suporte a outras plataformas de streaming chega nas próximas versões.

PRIVACIDADE
Sem conta, sem anúncios, sem rastreamento. O EpiRate só envia ao IMDb o título do que você está assistindo para buscar a nota; os resultados ficam em cache no seu dispositivo.

Encontrou um problema ou tem uma sugestão? Use "Relatar problema / Contato" na extensão ou escreva para {EMAIL}.

O EpiRate é um projeto independente, sem vínculo com o IMDb ou a Amazon e sem endosso deles. IMDb e Prime Video são marcas de seus respectivos proprietários.`,

  pl: `EpiRate pokazuje ocenę IMDb odcinka, który oglądasz w Prime Video – bezpośrednio w odtwarzaczu, bez wychodzenia z trybu pełnoekranowego.

CO OTRZYMUJESZ
• Ocenę odcinka pod tytułem serialu: {BADGE}. Pojawia się i znika razem z kontrolkami odtwarzacza, więc nic nie zasłania obrazu podczas oglądania.
• Kliknij plakietkę, aby zobaczyć cały sezon w jednym miejscu: miniwykres z oceną każdego odcinka. Tytuły kolejnych odcinków są ukryte – bez spoilerów.
• Oceny na liście odcinków na stronach seriali, zanim naciśniesz „odtwórz”.
• Oceny filmów i bieżąca ocena na ikonie na pasku narzędzi.
• Aktualizuje się samo, gdy zaczyna się kolejny odcinek; działa w trybie pełnoekranowym.
• Znajduje właściwy serial nawet przy przetłumaczonych tytułach. Złe dopasowanie? Poprawisz je dwoma kliknięciami, a wybór zostanie zapamiętany.
• Ty decydujesz, kiedy się pokazuje (z kontrolkami, na początku odcinka lub zawsze), gdzie i w jakim rozmiarze. Alt+Shift+I ukrywa plakietkę.
• Czyta Prime Video w 34 językach; interfejs w 12 językach.

WKRÓTCE
Obsługa kolejnych platform streamingowych pojawi się w następnych wersjach.

PRYWATNOŚĆ
Bez konta, bez reklam, bez śledzenia. EpiRate wysyła do IMDb wyłącznie tytuł tego, co oglądasz, aby sprawdzić ocenę; wyniki są przechowywane w pamięci podręcznej na Twoim urządzeniu.

Znalazłeś błąd lub masz sugestię? Użyj opcji „Zgłoś błąd / Kontakt” w rozszerzeniu albo napisz na {EMAIL}.

EpiRate to niezależny projekt, niepowiązany z IMDb ani Amazon i nieautoryzowany przez nie. IMDb i Prime Video są znakami towarowymi ich właścicieli.`,

  nl: `EpiRate toont de IMDb-score van de aflevering die je op Prime Video kijkt – direct in de speler, zonder het volledige scherm te verlaten.

WAT JE KRIJGT
• De score van de aflevering onder de serietitel: {BADGE}. Verschijnt en verdwijnt samen met de bediening van de speler, zodat niets het beeld bedekt terwijl je kijkt.
• Klik op de badge om het hele seizoen in één oogopslag te zien: een minigrafiek met de score van elke aflevering. Titels van komende afleveringen blijven verborgen – geen spoilers.
• Scores in de afleveringenlijst op seriepagina's, nog voordat je op afspelen drukt.
• Scores voor films en de huidige score op het pictogram in de werkbalk.
• Werkt zichzelf bij zodra de volgende aflevering begint; werkt ook in volledig scherm.
• Vindt de juiste serie, ook bij vertaalde titels. Verkeerde koppeling? In twee klikken aangepast en je keuze wordt onthouden.
• Jij kiest wanneer hij verschijnt (met de bediening, bij de start van een aflevering of altijd), waar en hoe groot. Alt+Shift+I verbergt hem.
• Leest Prime Video in 34 talen; interface in 12 talen.

BINNENKORT
Ondersteuning voor meer streamingplatforms volgt in komende versies.

PRIVACY
Geen account, geen advertenties, geen tracking. EpiRate stuurt alleen de titel van wat je kijkt naar IMDb om de score op te zoeken; resultaten worden op je apparaat in de cache bewaard.

Een fout gevonden of een suggestie? Gebruik 'Fout melden / Contact' in de extensie of mail naar {EMAIL}.

EpiRate is een onafhankelijk project en is niet verbonden aan of goedgekeurd door IMDb of Amazon. IMDb en Prime Video zijn handelsmerken van hun respectieve eigenaren.`,

  ja: `EpiRate は、Prime Video で視聴中のエピソードの IMDb 評価を、全画面表示のままプレーヤー内に表示します。

主な機能
• 作品タイトルの下にエピソードの評価を表示: {BADGE}。プレーヤーの操作バーと一緒に表示・非表示になるため、視聴中に映像を邪魔しません。
• バッジをクリックするとシーズン全体をひと目で確認できます。各エピソードの評価をミニグラフで表示し、今後のエピソードのタイトルは非表示なのでネタバレの心配もありません。
• シリーズページのエピソード一覧にも評価を表示。再生する前にチェックできます。
• 映画の評価や、ツールバーのアイコンに現在の評価も表示します。
• 次のエピソードが始まると自動で更新。全画面表示でも動作します。
• 翻訳されたタイトルでも正しい作品を検出。違う作品が表示されたら 2 クリックで修正でき、選択は保存されます。
• 表示するタイミング（操作バーと一緒・エピソード開始時・常に）、位置、サイズを選べます。Alt+Shift+I で非表示にできます。
• Prime Video を 34 言語で読み取り、インターフェースは 12 言語に対応しています。

今後の予定
今後のバージョンで、ほかのストリーミングサービスにも対応予定です。

プライバシー
アカウント不要、広告なし、トラッキングなし。EpiRate は評価を調べるために視聴中の作品名だけを IMDb に送信し、結果はお使いのデバイスにキャッシュされます。

不具合やご意見は、拡張機能の「不具合報告 / お問い合わせ」から、または {EMAIL} までお寄せください。

EpiRate は独立したプロジェクトであり、IMDb および Amazon とは提携・承認関係にありません。IMDb および Prime Video は各所有者の商標です。`,

  hi: `EpiRate, Prime Video पर आप जो एपिसोड देख रहे हैं उसकी IMDb रेटिंग सीधे प्लेयर में दिखाता है — फ़ुलस्क्रीन छोड़े बिना।

आपको क्या मिलता है
• सीरीज़ के शीर्षक के नीचे एपिसोड की रेटिंग: {BADGE}। यह प्लेयर के कंट्रोल के साथ दिखती और छिपती है, इसलिए देखते समय तस्वीर पर कुछ नहीं आता।
• बैज पर क्लिक करें और पूरा सीज़न एक नज़र में देखें: हर एपिसोड की रेटिंग का छोटा चार्ट। आने वाले एपिसोड के नाम छिपे रहते हैं — कोई स्पॉइलर नहीं।
• सीरीज़ पेज की एपिसोड सूची में रेटिंग, प्ले दबाने से पहले ही।
• फ़िल्मों की रेटिंग और टूलबार आइकन पर मौजूदा रेटिंग।
• अगला एपिसोड शुरू होते ही अपने आप अपडेट होता है; फ़ुलस्क्रीन में भी काम करता है।
• अनुवादित नामों के साथ भी सही सीरीज़ ढूँढ़ता है। गलत मिलान? दो क्लिक में ठीक करें — आपकी पसंद याद रखी जाती है।
• आप चुनें कि यह कब (कंट्रोल के साथ, एपिसोड की शुरुआत में या हमेशा), कहाँ और कितना बड़ा दिखे। Alt+Shift+I से छिपाएँ।
• Prime Video को 34 भाषाओं में पढ़ता है; इंटरफ़ेस 12 भाषाओं में।

जल्द आ रहा है
आने वाले संस्करणों में दूसरे स्ट्रीमिंग प्लेटफ़ॉर्म के लिए भी सपोर्ट आ रहा है।

गोपनीयता
कोई खाता नहीं, कोई विज्ञापन नहीं, कोई ट्रैकिंग नहीं। EpiRate रेटिंग खोजने के लिए सिर्फ़ उस चीज़ का नाम IMDb को भेजता है जिसे आप देख रहे हैं; नतीजे आपके डिवाइस पर कैश होते हैं।

कोई बग मिला या सुझाव है? एक्सटेंशन में "बग रिपोर्ट / संपर्क" का इस्तेमाल करें या {EMAIL} पर लिखें।

EpiRate एक स्वतंत्र प्रोजेक्ट है; यह IMDb या Amazon से संबद्ध नहीं है और उनके द्वारा समर्थित नहीं है। IMDb और Prime Video अपने-अपने मालिकों के ट्रेडमार्क हैं।`,

  ar: `يعرض EpiRate تقييم IMDb للحلقة التي تشاهدها على Prime Video داخل المشغّل مباشرةً، دون مغادرة وضع ملء الشاشة.

ماذا ستحصل عليه
• تقييم الحلقة أسفل عنوان المسلسل: {BADGE}. يظهر ويختفي مع أدوات التحكم في المشغّل، فلا يغطي أي شيء الصورة أثناء المشاهدة.
• انقر على الشارة لترى الموسم كاملًا بنظرة واحدة: مخطط صغير لتقييم كل حلقة. تبقى عناوين الحلقات القادمة مخفية — بلا حرق للأحداث.
• التقييمات في قائمة الحلقات بصفحات المسلسلات قبل أن تضغط على تشغيل.
• تقييمات الأفلام، والتقييم الحالي على أيقونة شريط الأدوات.
• يتحدّث تلقائيًا عند بدء الحلقة التالية، ويعمل في وضع ملء الشاشة.
• يجد المسلسل الصحيح حتى مع العناوين المترجمة. مطابقة خاطئة؟ صحّحها بنقرتين وسيتم تذكّر اختيارك.
• اختر متى يظهر (مع أدوات التحكم أو في بداية الحلقة أو دائمًا) وأين وبأي حجم. يخفيه الاختصار Alt+Shift+I.
• يقرأ Prime Video بـ 34 لغة، والواجهة متاحة بـ 12 لغة.

قريبًا
دعم منصات بث أخرى قادم في الإصدارات المقبلة.

الخصوصية
لا حساب ولا إعلانات ولا تتبّع. يرسل EpiRate إلى IMDb عنوان ما تشاهده فقط للبحث عن تقييمه، وتُحفظ النتائج مؤقتًا على جهازك.

هل وجدت مشكلة أو لديك اقتراح؟ استخدم «الإبلاغ عن مشكلة / تواصل معنا» في الإضافة أو راسلنا على {EMAIL}.

EpiRate مشروع مستقل وغير تابع لـ IMDb أو Amazon ولا يحظى بتأييدهما. IMDb وPrime Video علامتان تجاريتان لمالكيهما.`,
};
