/* EMA Lightning Web — tarayici TTS arayuzu (gea-runtime) + cikarim hatti.
 * Model: canberk7/ema-lightning (Apache-2.0). Agirliklar HuggingFace Hub'da.
 */
"use strict";
const ORT_VERSION = "1.30.0"; // index.html'deki CDN script ile AYNI olmali
const HF_REPO = "fr0stb1rd/ema-lightning-web-onnx";
const MODEL_BASE = `https://huggingface.co/${HF_REPO}/resolve/main`;
const MODEL_FILES = ["text_stage.onnx", "sound_stage.onnx", "decoder.onnx"];
const CACHE_NAME = "ema-lightning-web-v1";
const HIST_KEY = "ema-lightning-web-hist";
const RATE = 48000, FPS = 25;
const FIRST_WINDOW = 25, WINDOW = 100, CONTEXT = 8;
const MAX_WORD_FRAMES = 250, MAX_FRAMES = 3000, MAX_LETTERS = 250;

/* ---------- i18n: varsayilan tarayicidan, kullanici degistirebilir (kalici) ---------- */
const BROWSER_TR = (navigator.language || "tr").toLowerCase().startsWith("tr");
const PREFS_KEY = "ema-lightning-web-prefs";
let prefs = { theme: "system", lang: "auto", speed: 1, seed: 0, backend: "auto" };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")); } catch { }
if (!["system", "light", "dark"].includes(prefs.theme)) prefs.theme = "system";
if (!["auto", "tr", "en"].includes(prefs.lang)) prefs.lang = "auto";
if (!(prefs.speed >= 0.25 && prefs.speed <= 4)) prefs.speed = 1;
if (!(Number.isInteger(prefs.seed) && prefs.seed >= 0)) prefs.seed = 0;
if (!["auto", "wasm", "webgpu"].includes(prefs.backend)) prefs.backend = "auto";
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { } };
const effLang = () => prefs.lang === "auto" ? (BROWSER_TR ? "tr" : "en") : prefs.lang;
const T = {
  tr: {
    title: "⚡ EMA Lightning ONNX (Tarayıcıda)",
    sub: "Tarayıcıda çevrimdışı Türkçe TTS. Sunucu yok — her şey cihazınızda olur. Sayıları yazıyla yazın (örn. “bin iki yüz elli”).",
    ph: "Okunacak Türkçe metni yazın…",
    ex: "Örnekler:", exT: ["Kısa", "Orta", "Uzun", "Paragraf", "Hikâye"],
    speed: "Hız:", say: "Sesi Üret", busy: "Üretiliyor…", stop: "Durdur",
    seed: "Seed:", first: "ilk ses",
    backend: "Motor:", beAuto: "Otomatik",
    mText: "metin", mSound: "ses", mDec: "çöz",
    playing: "Çalınıyor (kalan üretiliyor…)",
    loading: "Modeller indiriliyor (ilk sefer, ~36 MB)…",
    ready: "Hazır.",
    done: (d) => `Tamamlandı (${d} sn ses).`,
    err: (m) => `Hata: ${m}`,
    empty: "önce metin yazın",
    dl: "İndir", bald: ".wav indir",
    cached: "önbellekten",
    remain: (s) => `~${s} sn kaldı`, elapsed: (s) => `${s} sn geçti`,
    hist: "Geçmiş", emptyHist: "Henüz üretim yok.",
    replay: "Oynat", del: "Sil",
    faq: "Sık sorulanlar",
    faqs: [
      ["İnternet bağlantısı gerekli mi?",
       "Modeller ilk açılışta bir kez iner (35,7 MiB); sonrası çevrimdışı çalışır."],
      ["Sesim veya yazdıklarım bir yere gönderiliyor mu?",
       "Hayır. Üretim dahil her şey tarayıcınızda olur; sunucu yok."],
      ["Hangi model kullanılıyor?",
       "EMA Lightning (8,6M parametre, Apache-2.0): ONNX'e çevrilip WebGPU/WASM ile çalıştırılıyor."],
      ["Sayıları neden yazıyla yazmalıyım?",
       "Orijinal paketteki normalizer-tr sayı/tarih okuyucu tarayıcıda yok; rakamlar rakam rakam okunur."],
      ["İlk açılış neden yavaş?",
       "Modeller ilk seferde iner (35,7 MiB). Sonraki gün içi ziyaretlerde indirme olmaz; bir gün sonra tazelenir."],
      ["Hangi tarayıcılarda çalışıyor?",
       "WebGPU olan Chromium tabanlı tarayıcılarda GPU ile, diğerlerinde (Safari, Firefox dahil) WASM ile çalışır."],
      ["Ürettiğim ses Python çıktısıyla birebir aynı mı?",
       "Hayır. Tarayıcı kendi rastgele sayı üretecini kullanır; konuşma geçerli olur ama bit-bit aynı olmaz."],
      ["Sesi indirebilir miyim?",
       "Evet. Üretim bitince tarih + metin adlı .wav dosyası olarak iner."],
      ["Ticari kullanım serbest mi?",
       "Evet. Model de bu site de Apache-2.0 lisanslı."],
      ["Bir şey bozulursa ne yapmalıyım?",
       "Sayfadaki “Modeli yeniden indir” düğmesi modelleri tazeler; “Önbelleği temizle” depoyu boşaltır."],
      ["Sesin hızını değiştirebilir miyim?",
       "Evet. Hız kutusu 0,25 ile 4 arasında değer alır; varsayılan 1."],
      ["Uzun metinlerde ne oluyor?",
       "Metin parçalara bölünür; ilk parça hemen çalar, kalanı arkada üretilir. Arayüz donmaz."],
      ["Geçmiş kayıtlarım nerede saklanıyor?",
       "Yalnızca tarayıcınızda: ses oturum boyunca bellekte, liste localStorage'da. × ile silebilirsiniz."],
      ["Önbellek ne kadar yer tutuyor?",
       "Modeller 35,7 MiB. Bir gün sonra otomatik tazelenir; “Önbelleği temizle” ile hemen boşaltılır."],
      ["Ekran kilitliyken dinleyebilir miyim?",
       "Evet. Kilit ekranında ve bildirimde oynat/duraklat kontrolleri çıkar."],
      ["Bu modeli kendi sitemde kullanabilir miyim?",
       "Evet. ONNX dosyaları HuggingFace Hub'da, Apache-2.0 lisanslı; indirip onnxruntime-web ile çalıştırabilirsiniz."],
      ["Arayüz hangi teknolojiyle yapıldı?",
       "Gea (@geajs/core) reaktif çalışma ortamı; derleme adımı yok, doğrudan tarayıcıda çalışır."],
      ["ONNX modelleri nasıl üretildi?",
       "PyTorch'un torch.export tabanlı dönüştürücüsüyle, GitHub Actions'ta; her aşama onnxruntime ile sayısal olarak doğrulandı."],
      ["Neden üç ayrı model dosyası var?",
       "Metin, ses ve çözücü ayrı aşamalar; tarayıcı parça parça üretip ilk cümleyi beklemeden çalabilsin diye."],
      ["Bunu kim yaptı?",
       "Site: fr0stb1rd. Model: Canberk Aslan (EMA Lightning). Sayı okuyucu (orijinal): Erdem Tuna."],
      ["Kaynak kod nerede?",
       "GitHub'da açık: ema-lightning-web. Sorun ve öneriler issue olarak bırakılabilir."],
      ["Katkıda bulunabilir miyim?",
       "Evet, repo Apache-2.0; pull request gönderebilirsiniz."],
      ["Seed ne işe yarıyor?",
       "Aynı metin ve aynı seed aynı sesi verir. Farklı bir varyasyon için zar butonuyla rastgele seed seçin."],
      ["Temizleme düğmeleri neyi siliyor?",
       "Geçmişteki × kaydı ve sesini siler. “Önbelleği temizle” modelleri ve üretilen sesleri siler, liste kalır. “Geçmişi temizle” listeyi de siler. İndirdiğiniz .wav dosyalarına hiçbiri dokunmaz."],
      ["Sayfadaki düğmeler ne işe yarıyor?",
       "Örnekler kutuyu doldurur. Hız 0,25–4 arası konuşma temposudur. Sesi Üret ilk cümleyi hemen çalar, kalanı arkada üretilir. İndir, biten sesi tarih ve metin adlı .wav olarak kaydeder."],
      ["Ayarlar ve geçmiş nasıl kullanılır?",
       "Tema ve Dil seçimleri tarayıcıda saklanır. Geçmişte Oynat sesi çalar, İndir kaydeder, × kaydı siler; ses yoksa (sayfa yenilenmişse) Oynat yeniden üretir."],
    ],
    clearCache: "Önbelleği temizle", redownload: "Modeli yeniden indir",
    cacheCleared: "Önbellek temizlendi.", clearHist: "Geçmişi temizle",
    histCleared: "Geçmiş temizlendi.",
    theme: "Tema:", thSystem: "Sistem", thLight: "Açık", thDark: "Koyu",
    lang: "Dil:", langAuto: "Otomatik",
    disc: `Bu yazılım bilgisayarınıza <b>35,7 MiB</b> model indirir ve cihazınızda çalıştırır. Bu yazılımın hiçbir garantisi yoktur. Bu yazılımı kullanarak <a href="https://github.com/fr0stb1rd/ema-lightning-web/blob/main/LICENSE">LICENSE</a>'ı okumuş ve onaylamış sayılırsınız.`,
  },
  en: {
    title: "⚡ EMA Lightning ONNX (in-browser)",
    sub: "Offline Turkish TTS in your browser. No server — everything runs on your device. Write numbers out in Turkish words (e.g. “bin iki yüz elli”).",
    ph: "Type Turkish text to speak…",
    ex: "Examples:", exT: ["Short", "Medium", "Long", "Paragraph", "Story"],
    speed: "Speed:", say: "Speak", busy: "Working…", stop: "Stop",
    seed: "Seed:", first: "first audio",
    backend: "Engine:", beAuto: "Auto",
    mText: "text", mSound: "sound", mDec: "decode",
    playing: "Playing (generating rest…)",
    loading: "Downloading models (first run, ~36 MB)…",
    ready: "Ready.",
    done: (d) => `Done (${d} s of audio).`,
    err: (m) => `Error: ${m}`,
    empty: "type some text first",
    dl: "Download", bald: ".wav download",
    cached: "from cache",
    remain: (s) => `~${s} s left`, elapsed: (s) => `${s} s elapsed`,
    hist: "History", emptyHist: "Nothing yet.",
    replay: "Play", del: "Delete",
    faq: "FAQ",
    faqs: [
      ["Do I need an internet connection?",
       "Models download once on first launch (35.7 MiB); afterwards it works offline."],
      ["Is my voice or text sent anywhere?",
       "No. Everything, including synthesis, runs in your browser; there is no server."],
      ["Which model is used?",
       "EMA Lightning (8.6M parameters, Apache-2.0): converted to ONNX and run with WebGPU/WASM."],
      ["Why should I spell out numbers?",
       "The original package's normalizer-tr number/date reader is not in the browser; digits are read one by one."],
      ["Why is the first launch slow?",
       "Models download once at first launch (35.7 MiB). No download on repeat visits within a day; refreshed after a day."],
      ["Which browsers work?",
       "Chromium-based browsers with WebGPU use the GPU; others (including Safari and Firefox) use WASM."],
      ["Is my audio identical to the Python output?",
       "No. The browser uses its own random generator; the speech is valid but not bit-identical."],
      ["Can I download the audio?",
       "Yes. When done, it downloads as a .wav named with the date and text."],
      ["Is commercial use allowed?",
       "Yes. Both the model and this site are Apache-2.0 licensed."],
      ["What if something breaks?",
       "The “Re-download model” button refreshes the models; “Clear cache” empties storage."],
      ["Can I change the speaking speed?",
       "Yes. The speed box accepts 0.25 to 4; default is 1."],
      ["What happens with long texts?",
       "Text is split into pieces; the first plays immediately while the rest generates in the background. The UI never freezes."],
      ["Where is my history stored?",
       "Only in your browser: audio in session memory, the list in localStorage. Delete with ×."],
      ["How much space does the cache use?",
       "Models are 35.7 MiB. Auto-refreshed after a day; “Clear cache” empties it now."],
      ["Can I listen with the screen locked?",
       "Yes. Play/pause controls appear on the lock screen and in notifications."],
      ["Can I use this model on my own site?",
       "Yes. The ONNX files are on HuggingFace Hub under Apache-2.0; download and run them with onnxruntime-web."],
      ["What is the UI built with?",
       "Gea (@geajs/core) reactive runtime; no build step, runs directly in the browser."],
      ["How were the ONNX models made?",
       "With PyTorch's torch.export-based converter on GitHub Actions; every stage numerically verified with onnxruntime."],
      ["Why three separate model files?",
       "Text, sound and decoder are separate stages so the browser can stream: play the first sentence without waiting."],
      ["Who made this?",
       "Site: fr0stb1rd. Model: Canberk Aslan (EMA Lightning). Number reader (original): Erdem Tuna."],
      ["Where is the source code?",
       "Open on GitHub: ema-lightning-web. Bugs and ideas welcome as issues."],
      ["Can I contribute?",
       "Yes, the repo is Apache-2.0; pull requests welcome."],
      ["What is the seed for?",
       "Same text and same seed give the same voice. Use the dice button for a random variation."],
      ["What do the cleanup buttons delete?",
       "The × on a history row deletes that entry and its audio. “Clear cache” deletes the models and generated audio, the list stays. “Clear history” deletes the list too. None of them touch your downloaded .wav files."],
      ["What do the buttons do?",
       "Examples fill the box. Speed sets the speaking tempo from 0.25 to 4. Speak plays the first sentence immediately while the rest generates. Download saves the finished audio as a .wav named with date and text."],
      ["How do settings and history work?",
       "Theme and Language choices are stored in the browser. In history, Play plays, Download saves, × deletes; if the audio is gone (page reloaded), Play regenerates it."],
    ],
    clearCache: "Clear cache", redownload: "Re-download model",
    cacheCleared: "Cache cleared.", clearHist: "Clear history",
    histCleared: "History cleared.",
    theme: "Theme:", thSystem: "System", thLight: "Light", thDark: "Dark",
    lang: "Language:", langAuto: "Auto",
    disc: `This software downloads <b>35.7 MiB</b> of models to your computer and runs them on your device. This software comes with no warranty. By using it, you agree that you have read and accepted the <a href="https://github.com/fr0stb1rd/ema-lightning-web/blob/main/LICENSE">LICENSE</a>.`,
  },
};
const t = () => T[effLang()];

const EXAMPLES = [
[ // kisa (3-7 kelime)
"Merhaba, size nasıl yardımcı olabilirim?",
"Günaydın, hayırlı sabahlar dilerim.",
"Siparişiniz yola çıktı bile.",
"Hava bugün gerçekten çok güzel.",
"Çayınız hazır, afiyet olsun.",
"Toplantı yarına ertelendi maalesef.",
"Kargonuz teslim edildi efendim.",
"İyi akşamlar, hoş geldiniz.",
"Yarın görüşmek üzere, hoşça kalın.",
"Randevunuz onaylandı, teşekkürler.",
"Ödeme başarıyla alındı, sağ olun.",
"Kapı açık, buyurun içeri gelin.",
"Yemek hazır, sofraya buyurun.",
"Telefonunuz sessizde kalmış galiba.",
"Anahtarları masada unutmuşsunuz.",
"Yağmur başladı, şemsiyeni al.",
"Kedi bahçede uyuyor sessizce.",
"Fırından taze ekmek aldım.",
"Bugün kendimi harika hissediyorum.",
"Trafik yoğun, biraz gecikeceğim.",
],
[ // orta (9-13 kelime)
"Siparişiniz yola çıktı, yarın sabah kapınızda olacak.",
"Beş kilogram un, iki litre süt ve bir düzine yumurta aldım.",
"On beş Ekim Çarşamba günü saat onda toplantımız var.",
"Sabah erken kalktım, kahvaltı edip sahilde yürüyüş yaptım.",
"Çocuklar parkta oynarken ben bankta kitap okudum.",
"Yeni komşularımız dün taşındı, akşam çaya davet ettiler.",
"Marketten meyve sebze alırken eski bir arkadaşıma rastladım.",
"Öğretmen ödevleri kontrol etti ve herkese tek tek açıkladı.",
"Doktor randevum öğleden sonraydı, biraz beklemek zorunda kaldım.",
"Akşam yemeğinde mercimek çorbası ve zeytinyağlı fasulye vardı.",
"Tren tam zamanında kalktı, cam kenarında rahat bir yolculuktu.",
"Kütüphaneden üç kitap ödünç aldım, ikisini bitirdim bile.",
"Bahçedeki güller açmış, mis gibi kokuyor her yer.",
"Elektrikler kesilince mum ışığında sohbet ettik ailecek.",
"Cumartesi günü piknik için erkenden yola çıkacağız inşallah.",
"Telefonun şarjı bitmek üzere, priz nerede acaba?",
"Yaşlı adam her sabah aynı saatte fırına uğruyor.",
"Kış gelmeden kombi bakımını yaptırmak lazım bence.",
"Deniz kenarında çay içmek gibisi yok şu mevsimde.",
"Çamaşırları astım, hava parçalı bulutlu ama kurur herhalde.",
],
[ // uzun (15-22 kelime)
"Dün akşam annemlerle görüntülü konuştuk, herkesin keyfi yerindeydi, bayramda köye gitmeyi planlıyoruz hep birlikte.",
"Sabah işe giderken otobüsü kaçırdım, sonraki durağa kadar yürüdüm, neyse ki toplantıya son anda yetiştim.",
"Hafta sonu evde büyük temizlik yaptık, camları sildik, halıları yıkamaya verdik, akşam yorgunluktan erkenden uyuduk.",
"Çocuğun okul kaydını yaptırmak için sabah erkenden gittik, sıra bekledik, evrakları teslim edip rahat bir nefes aldık.",
"Yaz tatilinde Ege kıyılarını gezdik, küçük koylarda yüzdük, akşamları sahil kasabalarında balık yedik, unutulmazdı.",
"Fırında pişen ekmeğin kokusu sokağa yayılmıştı, dayanamayıp iki tane aldım, biri eve varmadan bitti zaten.",
"Yeni işe başladığım ilk hafta her şey yabancı geliyordu, şimdi ekip arkadaşlarımla öğle yemeklerini birlikte yiyoruz.",
"Yağmurlu havalarda kitap okumayı seviyorum, pencere kenarına oturup çayımı yudumlarken saatlerin nasıl geçtiğini anlamıyorum.",
"Dedem bahçede domates biber yetiştirir, her yaz bize kasa kasa gönderir, tadı markettekilere hiç benzemez doğrusu.",
"Araba bakıma gidecek, lastikler değişecek, sigorta yenilenecek; bu ay masraflar üst üste geldi maalesef.",
"Komşunun kedisi her sabah kapımıza geliyor, süt veriyoruz, biraz sevilip sonra çatıya çıkıp güneşleniyor.",
"Üniversite sınavına hazırlanan kardeşim gece gündüz çalışıyor, deneme sonuçları giderek yükseliyor, umutluyuz.",
"Pazar kahvaltısı bizim evde gelenektir, herkes sofrada olur, menemen zeytin peynir eksik olmaz, çay demlikte tükenir.",
"Şehir dışından misafirlerimiz geldi, tarihi yerleri gezdirdik, akşam evde mantı açtık, çok eğlenceli bir gündü.",
"Telefonumun ekranı çatladı, servise verdim, bir hafta telefonsuz kalacağım, bakalım nasıl geçecek bu süre.",
"Kışın soba başında kestane kebap yapardık, dedem hikayeler anlatırdı, o günleri özlüyorum bazen.",
"Mahallede yeni bir park açıldı, çocuk oyun alanları ve yürüyüş yolları var, akşamları kalabalık oluyor.",
"Diş randevum vardı, biraz gergindim ama doktor çok nazikti, işlem sandığımdan çabuk bitti.",
"Yarın sabah erkenden yola çıkıyoruz, bavullar hazır, kahvaltıyı yolda yaparız diye düşündük.",
"Akşam haberlerinde hava durumunu izledim, hafta ortası yağış geliyor, şemsiyeleri hazırlamak lazım.",
],
[ // daha uzun (25-38 kelime)
"Sabah alarm çalmadan uyandım, pencereyi açtım, mis gibi temiz hava girdi içeri; kahvemi yapıp balkonda oturdum, kuş sesleri eşliğinde günü planladım, yapılacaklar listesini gözden geçirdim.",
"Geçen yaz Kapadokya'ya gittik, sabah gün doğumunda balonları izledik, yeraltı şehirlerini gezdik, testi kebabı yedik; rehberimiz bölgenin tarihini öyle güzel anlattı ki herkes hayran kaldı.",
"Ofiste yeni bir proje başladı, ekip beş kişi, ilk toplantıda görev dağılımı yaptık; benim payıma raporlama düştü, iki hafta sürem var, şimdiden araştırmalara başladım bile.",
"Annemin doğum günü için sürpriz parti hazırladık, kardeşim pastayı aldı, ben süsleri astım, misafirler erkenden geldi; annem kapıdan girince gözleri doldu, çok duygusal bir andı.",
"Kışın Uludağ'a kayak yapmaya gittik, ilk gün acemi pistinde düştüm kalktım, ikinci gün toparlandım; akşam otelde sıcak çikolata içip günün yorgunluğunu attık, harika bir tatildi.",
"Eski fotoğraflara bakarken çocukluğuma gittim, mahalle arkadaşlarımla sokakta oynadığımız günler geldi aklıma; şimdi herkes farklı şehirlerde, bayramlarda anca görüşebiliyoruz.",
"Evde küçük bir kütüphane kurdum, rafları tek tek dizdim, romanları yazara göre, tarih kitaplarını döneme göre ayırdım; akşamları bir saat okuma saati ilan ettim, huzur veriyor.",
"Pazar günü semt pazarına gittim, domates biber patlıcan aldım, köylü teyzeden taze yumurta seçtim; pazarlık yaparken esnafla sohbet etmek de işin en keyifli yanı doğrusu.",
"Yeni bir hobi edindim, ahşap boyama; önce küçük kutularla başladım, şimdi sehpa boyuyorum; ellerim boya içinde kalıyor ama ortaya çıkan işi görmek paha biçilemez.",
"Kardeşimle uzun bir yolculuğa çıktık, arabada eski şarkılar dinledik, mola yerlerinde çay içtik, yol kenarındaki köylerden gözleme aldık; varıştan çok yolun kendisi güzeldi.",
"Sabah sporu yapmaya karar verdim, ilk gün parkta iki tur koştum, bacaklarım ağrıdı ama vazgeçmedim; bir ay sonra nefesim açıldı, şimdi her sabah koşmadan güne başlayamıyorum.",
"Komşularla apartman toplantısı yaptık, aidatları konuştuk, bahçe düzenlemesine karar verdik, asansör bakımı için teklif alacağız; herkes söz aldı, demokratik bir toplantıydı.",
"Düğün hazırlıkları tam gaz sürüyor, davetiyeler basıldı, salon tutuldu, gelinlik provası yapıldı; bir yandan heyecan bir yandan stres, günler su gibi akıyor.",
"Köydeki evin çatısı akıtıyordu, usta çağırdık, kiremitler yenilendi, oluklar temizlendi; yağmur mevsimi gelmeden yetişti, içimiz rahat etti.",
"Çocuğuma bisiklet sürmeyi öğrettim, önce destek tekerlekleriyle başladı, sonra cesaretini topladı; ilk düşüşünde ağladı ama pes etmedi, şimdi parklarda tur atıyor.",
"Akşam yemeğine misafir gelecek, menüde mercimek çorbası, tavuk sote ve sütlaç var; sofrayı kurdum, salatayı hazırladım, saatine kadar her şey hazır olacak.",
"Kitap kulübünde bu ay tarihi bir roman okuduk, toplantıda karakterleri tartıştık, yazarın dili üzerine konuştuk; gelecek ay bilim kurgu seçtik, merakla bekliyorum.",
"Bahçeye sebze ektim, fideleri tek tek diktim, her sabah suluyorum; ilk filizler göründü, hasat zamanı komşularla paylaşacağım inşallah.",
"Emeklilik planları yapıyoruz eşimle, sahil kasabasında küçük bir ev hayalimiz var; bahçeli, denize yakın, torunların koşturacağı bir yer olsun istiyoruz.",
"Okulun kermesi için anneler kolları sıvadı, börekler açıldı, kekler pişirildi; gelir okul kütüphanesine bağışlanacak, katılım da oldukça yüksekti.",
],
[ // cok uzun (45-70 kelime, cok cumleli)
"Sabahın erken saatlerinde liman henüz uyanmamıştı. Balıkçılar ağlarını sessizce topluyor, martılar ise teknelerin etrafında dönerek şanslarını deniyordu. Ben sahilde yürürken tuzlu havayı içime çektim, dalgaların kıyıya vuruşunu dinledim. O an bütün haftanın yorgunluğu üzerimden kalktı sanki. Eve dönerken fırından sıcak simit aldım, kahvaltı sofrasında herkese günün ilk gülümsemesini verdim.",
"Yıllar önce dedemle yaylaya çıkardık her yaz. Sabah serinliğinde yola düşer, öğlene doğru çadırları kurardık. Dedem odun toplar, ben su taşırdım; akşam ateş başında anlattığı hikayeler hiç bitmezdi. Yıldızların altında uyur, sabah kuş sesleriyle uyanırdık. Şimdi o günleri torunlarıma anlatıyorum, onlar da aynı heyecanla dinliyor. Bazı anılar hiç eskimiyor, nesilden nesile taşınıyor.",
"Şehrin kalabalığından kaçıp köye yerleştik geçen yıl. İlk aylar zordu; internet kesiliyor, market uzaktı, komşular yabancıydı. Ama zamanla her şey yoluna girdi. Artık sabahları tavuk sesleriyle uyanıyor, bahçeden topladıklarımızla kahvaltı ediyoruz. Çocuklar sokakta özgürce oynuyor, akşamları komşularla çay içiyoruz. Şehirde unuttuğumuz huzuru burada yeniden bulduk, geri dönmeyi hiç düşünmüyoruz.",
"Üniversite yıllarımda harçlığımı çıkarmak için kafede çalışırdım. Sabah ders, öğleden sonra vardiya, gece ders çalışma; yorucu ama öğretici günlerdi. Patronum sabırlıydı, müşterilerle nasıl konuşulacağını ondan öğrendim. Bir gün ünlü bir yazar geldi kafeye, saatlerce sohbet ettik, kitabını imzaladı. O kitap hâlâ kitaplığımın en değerli köşesinde durur, her baktığımda o günleri hatırlarım.",
"Kışın ilk karı yağdığında çocuklar gibi sevinirim hâlâ. Pencereye koşar, sokağın beyaza bürünüşünü izlerim. Sonra kalın giyinip dışarı çıkarım; karın çatırtısını dinleyerek yürür, eldivenlerimle kardan adam yaparım. Akşam eve dönünce salep yaparım, battaniyeye sarılıp film izlerim. Kar tatili haberleri gelirse sevinirim, tatil olmasa da karın keyfini çıkarmayı bilirim artık.",
"Mahallemizde her yıl bahar şenliği düzenlenir. Esnaf tezgah açar, çocuklar yüz boyatır, gençler müzik yapar. Geçen yıl ben de gözleme tezgahının başına geçtim; hamur açmak sandığımdan zordu, kollarım ağrıdı ama çok eğlendim. Akşam havai fişeklerle kapanış yapıldı, herkes alkışladı. Bu tür etkinlikler komşuluğu güçlendiriyor, herkese tavsiye ederim katılmasını.",
"Emekli olduktan sonra gezmeye başladım eşimle. Önce yurt içini gezdik; Kapadokya, Pamukkale, Efes derken liste uzadı. Sonra yurt dışına açıldık; Balkanlar, İtalya, İspanya derken pasaportumuz damgalarla doldu. Her geziden magnet getiririz, buzdolabımız dünya haritası gibi oldu. Şimdi torunlarla geziyoruz, onların gözünden dünyayı yeniden keşfediyorum, yaşlılık hiç de sıkıcı değilmiş.",
"Çocukluğumda sokak oyunları oynardık; saklambaç, körebe, yakar top derken akşam ezanına kadar eve girmezdik. Annem pencereden seslenirdi, bir türlü kopamazdık oyundan. Şimdiki çocuklar ekran başında oynuyor, sokaklar sessiz. Geçen gün torunumu parka götürdüm, salıncakta sallanırken gözlerinin içi gülüyordu. Teknoloji ne kadar gelişirse gelişsin, açık havanın yerini hiçbir şey tutamaz bence.",
"Yeni evimize taşındığımız ilk gece heyecandan uyuyamadık. Kutular her yerdeydi, yatak odasını zor bulduk. Sabah komşu kapıyı çaldı, hoş geldin böreği getirmiş; o an evimizde hissettik kendimizi. Günlerce yerleşmeyle uğraştık, her kutu ayrı bir hatırayı ortaya çıkardı. Şimdi her köşesi bize ait, duvarlarda fotoğraflarımız var. Ev dediğin dört duvar değil, içine sığdırdığın anılarmış meğer.",
"Ramazan ayında mahallemiz bir başka güzel olur. İftar sofraları kurulur, komşular birbirine yemek gönderir, çocuklar pide kuyruğunda bekler. Teravih çıkışı çay ocakları dolar, sohbetler sahura kadar sürer. Bayram sabahı herkes en güzel kıyafetlerini giyer, büyüklerin elleri öpülür, şekerler toplanır. Bu ayın bereketi bir başka; birlik beraberlik duygusu her eve yayılır, dargınlar barışır.",
"Deniz kenarında büyüdüm ben; yaz demek deniz, kum, güneş demekti bizim için. Sabah erkenden plaja gider, akşam güneş batana kadar sudan çıkmazdık. Annem seslenirdi yemek hazır diye, ıslak mayoyla sofraya otururduk. Tuzlu suyun yapışkanlığı, güneş yanığının acısı, dondurmacının zili; hepsi çocukluğumun sesi. Şimdi kendi çocuklarıma aynı yazları yaşatmaya çalışıyorum, deniz sevgisi miras kalıyor.",
"Okulun ilk günü hiç unutmam; yeni çanta, yeni defterler, heyecandan çarpan kalp. Annem kapıya kadar getirdi, öğretmenim elimi tuttu, sınıf capcanlıydı. İlk hafta isimleri karıştırdım, sonra herkesle arkadaş oldum. Yıllar geçti, o sınıftaki dostlukların çoğu hâlâ sürüyor. Eğitim hayatım boyunca birçok okul değiştirdim ama ilk günün heyecanı hep aynı kaldı, her başlangıç bir umut taşıyor.",
"Kış hazırlıkları sonbaharda başlar bizim evde; turşular kurulur, konserveler yapılır, tarhana serilir. Annem her işin ustasıdır, tarifleri göz kararı verir, tadı da hep tutar. Ben yardım ederim, kavanoz taşırım, etiket yapıştırırım. Kiler doldukça içimiz rahatlar, kış boyu hazır yemek keyfi süreriz. Marketten almakla ev yapımı bir olur mu hiç; emek giren her şey daha lezzetli olur.",
"Hayatımın en güzel sabahlarından biriydi; kızımın doğduğu gün. Sabaha karşı hastaneye gittik, saatlerce bekledik, sonra o ilk ağlama sesi duyuldu. Hemşire kucağıma verdi, minicik elleri parmağıma sarıldı. O an dünyadaki bütün dertler silindi, sadece o minik nefes vardı. Şimdi kocaman oldu, okula gidiyor ama o sabahı dün gibi hatırlıyorum, ebeveynlik böyle bir şey işte.",
"Ninemin evi köyün girişindeydi; avluda tavuklar, bahçede erik ağaçları vardı. Yazları oraya giderdik, sabah süt sağmaya kalkardık, öğlen yayık ayranı içerdik. Ninem ekmek yapardı tandırda, kokusu bütün köyü sarardı. Akşamları masal anlatırdı, cinler periler derken uykuya dalardık. O ev satıldı yıllar önce ama kokusu, sesi, sıcaklığı hâlâ burnumda; çocukluğum orada kaldı sanki.",
"Gençken İstanbul'a ilk gelişimde gözlerime inanamamıştım; kalabalık, trafik, vapurlar, martılar derken başım dönmüştü. Köprüden geçerken iki kıtayı birden gördüm, tarih her köşedeydi. Yıllar içinde şehre alıştım, semtleri öğrendim, favori mekanlarım oldu. Şimdi buranın kaosunu bile seviyorum; vapurda çay içmek, Galata'dan gün batımını izlemek gibisi yok. İstanbul insanı yorar ama bırakmaz, bağımlılık yapar.",
"Depremden sonra mahallemiz kenetlendi; çadırlar kuruldu, yemekler paylaşıldı, nöbetleşe bekledik. Kimse kimseyi tanımıyordu önceden, şimdi herkes akraba gibi. Zor günler insanları birbirine bağlar derlerdi, yaşayarak öğrendik. Evler onarıldı, hayat normale döndü ama o dayanışma ruhu kaldı. Artık her yıl o günü anıyoruz, kaybettiklerimizi rahmetle, kalanları şükranla hatırlıyoruz.",
"Torun sahibi olunca hayatım değişti; zamanımın çoğu onunla geçiyor artık. Parkta salıncak sallıyorum, masal okuyorum, birlikte resim yapıyoruz. Onun kahkahası bütün yorgunluğumu alıyor, minik elleriyle yüzüme dokunuşu dünyaya bedel. Gençliğimde kariyer peşinde koşmuşum, şimdi anlıyorum ki asıl zenginlik bu anlarmış. Herkese tavsiyem: sevdiklerinizle vakit geçirmeyi ertelemeyin, zaman çok hızlı geçiyor.",
"Ege'de küçük bir sahil kasabasına yerleştik emekli olunca; sabah balıkçılarla denize açılıyor, öğlen kahvede okey oynuyoruz. Akşamları sahilde yürüyüş yapıyor, gün batımını izliyoruz. Komşular sıcakkanlı, herkes birbirini tanıyor, kapılar kilitlenmiyor bile. Kışın sakin, yazın cıvıl cıvıl; iki mevsimi de ayrı güzel. Şehirdeki stresi burada unuttuk, tansiyonum bile düzeldi doktorun dediğine göre.",
"Çocukken dedemin radyosundan dinlerdim türküleri; sesi cızırtılıydı ama tadı başkaydı. Akşam olunca aile toplanır, dedem türkü söyler, biz dinlerdik. O türküler kulağıma işlemiş, hâlâ mırıldanırım bazen. Şimdi dijital platformlarda her şey var ama o radyonun sıcaklığı yok. Teknoloji ilerliyor, ses kalitesi artıyor ama bazı duygular analog kalıyor; nostalji de böyle bir şey işte, geçmişi özlüyoruz hep.",
],
];

/* ---------- gea store ---------- */
const { Store, Component, GEA_OBSERVER_REMOVERS } = gea;
class UI extends Store {
  phase = "idle";      // idle|loading|ready|busy|playing|done|error
  text = EXAMPLES[0][0];
  speed = prefs.speed;
  seed = prefs.seed;
  pct = 0; stats = ""; status = ""; dlSeq = 0;
  audioURL = ""; audioSize = ""; histSeq = 0;
}
const ui = new UI();

/* ---------- kucuk yardimcilar ---------- */
const $ = (id) => document.getElementById(id);
const fmtMB = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fmtS = (s) => s < 60 ? `${Math.round(s)}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Indirilen dosya adi: tarih + soylenen yazi (en fazla 40 harf, guvenli karakterler).
function dlName(text) {
  const tr = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u" };
  const slug = (text || "ema").replaceAll("İ", "i").replaceAll("I", "ı").toLowerCase()
    .split("").map((c) => tr[c] || c).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "ema";
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}_${slug}.wav`;
}

/* ---------- kalici ayarlar: tema + dil ---------- */
function applyTheme() {
  if (prefs.theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", prefs.theme);
}
function fillSelects(root) {
  const th = root.querySelector(".theme"), ls = root.querySelector(".langsel");
  th.innerHTML = [["system", t().thSystem], ["light", t().thLight], ["dark", t().thDark]]
    .map(([v, l]) => `<option value="${v}"${prefs.theme === v ? " selected" : ""}>${l}</option>`).join("");
  ls.innerHTML = [["auto", t().langAuto], ["tr", "Türkçe"], ["en", "English"]]
    .map(([v, l]) => `<option value="${v}"${prefs.lang === v ? " selected" : ""}>${l}</option>`).join("");
  paintEp(root);
}
function paintEp(root) {
  const be = root.querySelector(".be");
  if (be) be.innerHTML = [["auto", t().beAuto], ["webgpu", "WebGPU"], ["wasm", "WASM"]]
    .map(([v, l]) => `<option value="${v}"${prefs.backend === v ? " selected" : ""}>${l}</option>`).join("");
}
async function setBackend(v) {
  if (ui.phase === "busy" || ui.phase === "playing" || ui.phase === "loading") return;
  prefs.backend = v; savePrefs();
  if (!sessText) return; // henuz yuklenmemis: secim bir sonraki yuklemede gecerli
  try {
    for (const s of [sessText, sessSound, sessDec]) await s?.release().catch(() => {});
    sessText = sessSound = sessDec = null;
    await loadModels();
  } catch (e) { ui.phase = "error"; ui.status = t().err(e.message); }
}

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} (HTTP ${r.status})`);
  return r.json();
}

// Cache-first indirme (Transformers.js kalibi): once Cache Storage, yoksa ag + put.
// Vade 1 gun: suresi dolan kayit silinip yeniden indirilir.
const CACHE_TTL = 24 * 3600 * 1000; // 1 gun
const TS_KEY = "ema-lightning-web-cache-ts";
const cacheTs = () => { try { return JSON.parse(localStorage.getItem(TS_KEY) || "{}"); } catch { return {}; } };
const stampCache = (url) => {
  try {
    const m = cacheTs(); m[url] = Date.now();
    localStorage.setItem(TS_KEY, JSON.stringify(m));
  } catch { }
};
async function cachedResponse(url) {
  const jar = ("caches" in self) ? await caches.open(CACHE_NAME).catch(() => null) : null;
  if (jar) {
    const hit = await jar.match(url).catch(() => null);
    if (hit) {
      if (Date.now() - (cacheTs()[url] || 0) < CACHE_TTL) return { res: hit, fromCache: true, jar };
      jar.delete(url).catch(() => { }); // suresi dolmus: sil, agdan indir
    }
  }
  const net = await fetch(url);
  if (!net.ok) throw new Error(`${url.split("/").pop()} (HTTP ${net.status})`);
  if (jar && (net.type === "basic" || net.type === "cors")) {
    jar.put(url, net.clone()).catch(() => { });
    stampCache(url);
  }
  return { res: net, fromCache: false, jar };
}

async function fetchBuffer(url, onTick) {
  const { res, fromCache } = await cachedResponse(url);
  const total = Number(res.headers.get("content-length")) || 0;
  const chunks = []; let loaded = 0;
  const reader = res.body.getReader();
  for (; ;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.byteLength;
    onTick(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return { buf, fromCache };
}

/* ---------- TTS cekirdegi (orijinal hattin portu) ---------- */
let VOCAB = null, STOI = null, TIMES = null, LATENT = 64;
let sessText = null, sessSound = null, sessDec = null;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(rows, cols, rand) {
  const o = new Float32Array(rows * cols);
  for (let i = 0; i < o.length; i += 2) {
    const u1 = Math.max(rand(), 1e-9), u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1)), t = 2 * Math.PI * u2;
    o[i] = r * Math.cos(t); if (i + 1 < o.length) o[i + 1] = r * Math.sin(t);
  }
  return o;
}
function finish(p) {
  const s = p.replace(/["')]+$/, "");
  return [".", "!", "?"].includes(s.slice(-1)) ? p : p.replace(/[,;:\- ]+$/, "") + ".";
}
function chunk(text, speed) {
  const limit = Math.min(MAX_LETTERS, Math.round(18 * 10 * speed));
  const cuts = [[/[.!?]+["']*(?= )/g, 0.25], [/[,;:](?= )/g, 0.12], [/\S(?= )/g, 0.12]];
  const pieces = [];
  let rest = text.trim();
  while (rest) {
    let cut = rest.length, pause = 0;
    if (rest.length > limit) {
      cut = limit;
      for (const [re, gap] of cuts) {
        const ends = []; const rx = new RegExp(re.source, "g");
        let m; while ((m = rx.exec(rest)) && m.index <= limit) ends.push(m.index + m[0].length);
        if (ends.length) { cut = ends[ends.length - 1]; pause = gap; break; }
      }
    }
    const piece = rest.slice(0, cut).trim(); rest = rest.slice(cut).trim();
    if (/\p{L}/u.test(piece)) pieces.push([finish(piece), pause]);
  }
  if (pieces.length) pieces[pieces.length - 1][1] = 0;
  return pieces;
}
function alphabet(text) { // SADELESTIRILMIS: normalizer-tr yok, sayilari yaziyle yazin
  // Orijinal frontend.py ile ayni: Turkce harfler oldugu gibi kalir (NFKD'ye sokulmaz),
  // diger harflerin aksanlari soyulur, vocab'da olmayan her sey bosluk olur.
  const TURKISH = new Set([..."çğıöşü"]);
  const typo = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "..." };
  text = text.replace(/[’‘“”–—…]/g, (c) => typo[c] || c).toLocaleLowerCase("tr");
  const vs = new Set(VOCAB);
  let out = "";
  for (const ch of text) {
    if (TURKISH.has(ch)) { out += vs.has(ch) ? ch : " "; continue; }
    const base = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    out += (base && [...base].every((c) => vs.has(c))) ? base : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}
function piece(text) {
  const ids = [...text].map((c) => STOI[c] ?? 1);
  const starts = [];
  [...text].forEach((c, i) => { if (c !== " " && (i === 0 || text[i - 1] === " ")) starts.push(i); });
  if (!starts.length) starts.push(0);
  const bounds = [0, ...starts.slice(1), text.length];
  const cw = [], wstart = [];
  for (let w = 0; w < bounds.length - 1; w++)
    for (let i = bounds[w]; i < bounds[w + 1]; i++) { cw.push(w); wstart.push(bounds[w]); }
  return { text, ids, cw, wstart };
}
/* ---------- calisma ortami: iOS'ta WASM'a zorla ---------- */
// onnxruntime-web'in WebGPU derlemesi iPhone/iPad'de sekmeyi olduruyor (olculdu);
// iOS tespiti: UA + dokunmatik Mac (iPadOS kendini Mac gibi gosterir).
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
let effEP = "wasm";
function effEPS() {
  const list = prefs.backend === "auto"
    ? (IS_IOS ? ["wasm"] : ["webgpu", "wasm"])
    : [prefs.backend];
  effEP = list[0];
  return list;
}
const Big = (arr, dims) => new ort.Tensor("int64", BigInt64Array.from(arr.map(BigInt)), dims);
const F32 = (arr, dims) => new ort.Tensor("float32", Float32Array.from(arr), dims);
const Bool = (arr, dims) => new ort.Tensor("bool", Uint8Array.from(arr.map(Number)), dims);

function plan(p, dur) {
  const nw = p.cw[p.cw.length - 1] + 1;
  const per = new Array(nw).fill(0);
  p.cw.forEach((w, i) => per[w] += dur[i]);
  const n = per.map((x) => Math.min(MAX_WORD_FRAMES, Math.max(1, Math.round(x))));
  const frames = Math.min(n.reduce((a, b) => a + b, 0), MAX_FRAMES);
  const cum = []; let s = 0; for (const x of n) { cum.push(s); s += x; }
  const fw = [], fp = [];
  let k = 0;
  for (let w = 0; w < nw && k < frames; w++)
    for (let j = 0; j < n[w] && k < frames; j++, k++) { fw.push(w); fp.push((k - cum[w]) / n[w]); }
  return { fw, fp, frames };
}
function windows(frames, first = WINDOW) {
  const spans = []; let s = 0;
  while (s < frames) { const e = Math.min(frames, s + (s === 0 ? first : WINDOW)); spans.push([s, e]); s = e; }
  return spans;
}
const concat = (parts) => {
  const out = new Float32Array(parts.reduce((a, x) => a + x.length, 0));
  let o = 0; for (const c of parts) { out.set(c, o); o += c.length; }
  return out;
};

async function loadModels() {
  ui.phase = "loading"; ui.status = t().loading; ui.pct = 0; ui.stats = "";
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  // Agir cikarim isini arka plan worker'ina tasi: arayuz donmaz.
  // (Pages COOP/COEP gondermedigi icin tek thread; proxy sadece yeri degistirir.)
  ort.env.wasm.proxy = true;
  const files = MODEL_FILES;
  const t0 = performance.now();
  const state = Object.fromEntries(files.map((f) => [f, { loaded: 0, total: 0 }]));
  let last = 0, anyCached = false;
  const tick = () => {
    const now = performance.now();
    if (now - last < 120) return;
    last = now;
    const loaded = files.reduce((a, f) => a + state[f].loaded, 0);
    const total = files.reduce((a, f) => a + state[f].total, 0);
    const el = (now - t0) / 1000, spd = loaded / Math.max(el, 0.01);
    ui.pct = total ? Math.min(100, (100 * loaded) / total) : 0;
    const left = spd > 0 && total ? Math.max(0, (total - loaded) / spd) : 0;
    ui.stats = (total
      ? `${ui.pct.toFixed(0)}% • ${fmtMB(loaded)} / ${fmtMB(total)} • ${fmtMB(spd)}/sn • ${t().elapsed(fmtS(el))} • ${t().remain(fmtS(left))}`
      : `${fmtMB(loaded)} • ${fmtMB(spd)}/sn • ${t().elapsed(fmtS(el))}`)
      + (anyCached ? ` • ${t().cached}` : "");
    ui.dlSeq++;
  };
  const opt = { executionProviders: effEPS(), graphOptimizationLevel: "all" };
  const v = await loadJSON("vocab.json");
  VOCAB = v.vocab; STOI = v.stoi; TIMES = v.times; LATENT = v.latent_dim;
  const makeSessions = () => files.map(async (f) => {
    const { buf, fromCache } = await fetchBuffer(`${MODEL_BASE}/${f}`,
      (loaded, total) => { state[f] = { loaded, total }; tick(); });
    if (fromCache) anyCached = true;
    state[f].loaded = state[f].total || state[f].loaded; tick();
    return ort.InferenceSession.create(buf, opt);
  });
  try {
    [sessText, sessSound, sessDec] = await Promise.all(makeSessions());
  } catch (e) {
    // Worker kurulamazsa ana threade dus.
    ort.env.wasm.proxy = false;
    [sessText, sessSound, sessDec] = await Promise.all(makeSessions());
  }
  ui.pct = 100;
  { // son tick throttle'a takilmis olabilir; kapanis satirini burada yaz
    const totalAll = files.reduce((a, f) => a + (state[f].total || state[f].loaded), 0);
    ui.stats = `100% • ${fmtMB(totalAll)} / ${fmtMB(totalAll)}` + (anyCached ? ` • ${t().cached}` : "");
  }
  ui.dlSeq++;
  // Isinma: GPU shader'lari bir kez derlensin, ilk uretim hizli baslasin (cikti cope).
  for await (const _ of synthPieces("Merhaba.", 1, 0)) {}
  ui.phase = "ready"; ui.status = t().ready;
}

// Parca parca uretir (pipelining icin async generator): her yield bir parcadir.
async function* synthPieces(text, speed, seed, stats = null) {
  const spoken = alphabet(text);
  let seedI = 0;
  const tick = (key, t0) => { if (stats) stats[key] = (stats[key] || 0) + performance.now() - t0; };
  for (const [part, pause] of chunk(spoken, speed)) {
    const p = piece(part);
    const L = p.ids.length;
    let t0 = performance.now();
    const t = await sessText.run({ ids: Big(p.ids, [1, L]), mask: Bool(new Array(L).fill(1), [1, L]) });
    const d = t.h.dims[2];
    const h = Array.from(await t.h.getData()), dur = Array.from(await t.dur.getData()).map((x) => x / speed);
    tick("text", t0);
    const { fw, fp, frames } = plan(p, dur);
    const rand = mulberry32((seed * 1000003 + seedI++) >>> 0);
    const noise = [];
    for (let k = 0; k < TIMES.length; k++) noise.push(...randn(frames, LATENT, rand));
    t0 = performance.now();
    const lat = await sessSound.run({
      h: F32(h, [1, L, d]), dur: F32(dur, [1, L]),
      mask: Bool(new Array(L).fill(1), [1, L]),
      cw: Big(p.cw, [1, L]), wstart: Big(p.wstart, [1, L]),
      fw: Big(fw, [1, frames]), fp: F32(fp, [1, frames]),
      fmask: Bool(new Array(frames).fill(1), [1, frames]),
      noise: F32(noise, [1, TIMES.length, frames, LATENT]),
    });
    const latents = Array.from(await lat.latents.getData());
    tick("sound", t0);
    const waves = [];
    for (const [ws, we] of windows(frames, FIRST_WINDOW)) {
      const a = Math.max(0, ws - CONTEXT), b = Math.min(frames, we + CONTEXT);
      const n = b - a, z = new Float32Array(LATENT * n);
      for (let f = 0; f < n; f++)
        for (let c = 0; c < LATENT; c++) z[c * n + f] = latents[(a + f) * LATENT + c];
      t0 = performance.now();
      const dec = await sessDec.run({ z: new ort.Tensor("float32", z, [1, LATENT, n]) });
      const adata = await dec.audio.getData();
      tick("decode", t0);
      const hop = adata.length / n;
      waves.push(adata.slice((ws - a) * hop, (we - a) * hop));
    }
    if (pause > 0) waves.push(new Float32Array(Math.round(pause * RATE)));
    const audio = concat(waves);
    // Kelime zamanlari (karaoke icin): cercevenin soyledigi kelime, saniye olarak.
    const wlist = part.split(" "), wstarts = new Array(wlist.length).fill(null);
    fw.forEach((w, f) => { if (wstarts[w] === null) wstarts[w] = f / FPS; });
    yield { audio, words: wlist, starts: wstarts.map((s) => s ?? 0), seconds: audio.length / RATE };
  }
}

function toWav(samples) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); ws(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([b], { type: "audio/wav" });
}

/* ---------- gecmis (oturum ici ses + localStorage meta) ---------- */
let hist = [];
let lastGenText = ""; // indir tusunun adlandirmasi icin uretilen metin
try { hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch { hist = []; }
function saveHist() {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, 20).map(
      ({ text, speed, dur, size }) => ({ text, speed, dur, size }))));
  } catch { }
}

/* ---------- webaudio ile kesintisiz calis (blob zinciri yok) ---------- */
let AC = null, PS = null, runId = 0;
function ensureCtx() {
  if (!AC) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE });
    const master = ctx.createGain();
    master.connect(ctx.destination);
    AC = { ctx, master };
    setupMedia();
  }
  return AC;
}
function setupMedia() {
  if (!("mediaSession" in navigator) || !AC) return;
  try {
    navigator.mediaSession.setActionHandler("play", () => AC.ctx.resume().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => AC.ctx.suspend().catch(() => {}));
  } catch {}
}
function setMediaText(text) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: text.slice(0, 80) || "EMA Lightning",
      artist: "EMA Lightning",
      album: effLang() === "tr" ? "Tarayıcıda Türkçe TTS" : "In-browser Turkish TTS",
    });
  } catch {}
}
// Calmakta olani durdur (uretim iptali de bu runId ile olur).
function stopAll() {
  runId++;
  if (PS) { for (const s of PS.sources) try { s.stop(); } catch {} }
  PS = null;
  if (ui.phase === "busy" || ui.phase === "playing") { ui.phase = "ready"; ui.status = t().ready; }
}

/* ---------- onbellek yonetimi ---------- */
function dropAudio() { // calan + uretilmis sesleri bellekten dusur
  stopAll();
  if (ui.audioURL) { URL.revokeObjectURL(ui.audioURL); ui.audioURL = ""; }
}
async function clearCache() {
  try {
    if ("caches" in self) await caches.delete(CACHE_NAME).catch(() => {});
    try { localStorage.removeItem(TS_KEY); } catch {}
    // Uretilen sesleri de bellekten dusur (liste kalir, tekrar uretilebilir).
    hist.forEach((h) => { h.audio = null; });
    dropAudio();
    saveHist(); ui.histSeq++;
    ui.status = t().cacheCleared;
  } catch (e) { ui.status = t().err(e.message); }
}
function clearHist() { // gecmisi komple sil: liste + sesler
  dropAudio();
  hist = [];
  saveHist(); ui.histSeq++;
  ui.status = t().histCleared;
}
async function redownload() {
  if (ui.phase === "busy" || ui.phase === "playing" || ui.phase === "loading") return;
  try {
    if ("caches" in self) {
      const jar = await caches.open(CACHE_NAME).catch(() => null);
      if (jar) for (const f of MODEL_FILES) await jar.delete(`${MODEL_BASE}/${f}`).catch(() => {});
    }
    for (const s of [sessText, sessSound, sessDec]) await s?.release().catch(() => {});
    sessText = sessSound = sessDec = null;
    await loadModels();
  } catch (e) { ui.phase = "error"; ui.status = t().err(e.message); }
}

class App extends Component {
  template() {
    return `
      <div id="${this.id}">
        <div class="top">
          <h1>${t().title}</h1>
          <div class="set">
            <label>${t().theme} <select class="theme"></select></label>
            <label>${t().lang} <select class="langsel"></select></label>
            <label><span class="belab">${t().backend}</span> <select class="be"></select> <span class="beeff"></span></label>
          </div>
        </div>
        <p class="sub">${t().sub}</p>
        <textarea class="txt" placeholder="${t().ph}">${esc(ui.text)}</textarea>
        <div class="ex"><span class="exlab">${t().ex}</span>${EXAMPLES.map((x, i) =>
      `<button class="ghost exb" data-i="${i}">${t().exT[i]}</button>`).join("")}</div>
        <div class="row">
          <label class="speed"><span class="spdlab">${t().speed}</span> <input class="spd" type="number" value="${ui.speed}" step="0.25" min="0.25" max="4"></label>
          <label class="speed"><span class="seedlab">${t().seed}</span> <input class="seed" type="number" value="${ui.seed}" step="1" min="0"></label>
          <button class="ghost dice" title="🎲">🎲</button>
          <button class="say">${t().say}</button>
          <button class="ghost dl" disabled hidden>${t().dl}</button>
        </div>
        <div class="out" hidden>
          <div class="bar" hidden><i></i></div>
          <div class="stats"></div>
          <p class="status"></p>
          <p class="now"></p>
        </div>
        <div class="hh" hidden><h2>${t().hist}</h2><div class="hl"></div></div>
        <div class="row store">
          <button class="ghost sclr">${t().clearCache}</button>
          <button class="ghost sredl">${t().redownload}</button>
          <button class="ghost shist">${t().clearHist}</button>
        </div>
        <p class="foot"><a href="https://github.com/fr0stb1rd/ema-lightning-web">ema-lightning-web</a> · model: <a href="https://github.com/canberk7/ema-lightning">canberk7/ema-lightning</a> (Apache-2.0) · onnx: <a href="https://huggingface.co/fr0stb1rd/ema-lightning-web-onnx">ema-lightning-web-onnx</a></p>
        <p class="foot disc"></p>
        <div class="faq"><h2></h2><div class="fl"></div></div>
      </div>`;
  }
  createdHooks() {
    const R = this[GEA_OBSERVER_REMOVERS];
    R.push(ui.observe("phase", () => this.paint()));
    R.push(ui.observe("dlSeq", () => this.paintDl()));
    R.push(ui.observe("audioURL", () => this.paintAudio()));
    R.push(ui.observe("histSeq", () => this.paintHist()));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (ui.phase === "busy" || ui.phase === "playing")) stopAll();
    });
    this.$(".spd").addEventListener("dblclick", () => {
      ui.speed = 1; prefs.speed = 1; savePrefs(); this.$(".spd").value = 1;
    });
    this.$(".seed").addEventListener("dblclick", () => {
      ui.seed = 0; prefs.seed = 0; savePrefs(); this.$(".seed").value = 0;
    });
    this.autosize();
    effEPS();
    applyTheme(); fillSelects(this.el); this.applyLang();
    this.paint(); this.paintHist();
  }
  autosize() {
    const el = this.$(".txt");
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, innerHeight * 0.5) + "px";
  }
  applyLang() { // statik etiketleri guncel dile cevir (dinamik durum bir sonraki adimda guncellenir)
    const q = (s) => this.$(s);
    q("h1").textContent = t().title;
    q(".sub").textContent = t().sub;
    q(".txt").placeholder = t().ph;
    q(".exlab").textContent = t().ex;
    this.$$(".exb").forEach((b, i) => { b.textContent = t().exT[i]; });
    q(".spdlab").textContent = t().speed;
    q(".seedlab").textContent = t().seed;
    fillSelects(this.el);
    q(".hh h2").textContent = t().hist;
    q(".disc").innerHTML = t().disc;
    q(".faq h2").textContent = t().faq;
    q(".faq .fl").innerHTML = t().faqs.map(([q_, a]) =>
      `<details><summary>${esc(q_)}</summary><p>${esc(a)}</p></details>`).join("");
    q(".sclr").textContent = t().clearCache;
    q(".sredl").textContent = t().redownload;
    q(".shist").textContent = t().clearHist;
    q(".belab").textContent = t().backend;
    this.$(".beeff").textContent = `(${effEP})`;
    if (ui.phase === "ready") ui.status = t().ready;
    this.paint(); this.paintHist();
  }
  paint() {
    const loading = ui.phase === "loading", active = ui.phase === "busy" || ui.phase === "playing";
    this.$(".say").disabled = loading;
    this.$(".say").textContent = active ? t().stop : t().say;
    this.$(".bar").hidden = !(loading || ui.phase === "ready");
    this.$(".status").textContent = ui.status;
    this.$(".beeff").textContent = `(${effEP})`;
    this.$(".out").hidden = !(ui.status || ui.stats || this.$(".now").innerHTML);
    this.paintDl(); this.paintAudio();
  }
  paintDl() {
    this.$(".bar i").style.width = `${ui.pct}%`;
    this.$(".stats").textContent = ui.stats;
  }
  paintAudio() {
    const has = !!ui.audioURL;
    const dl = this.$(".dl");
    dl.hidden = !has; dl.disabled = !has;
    if (has) dl.textContent = `${t().dl} (${ui.audioSize})`;
  }
  paintHist() {
    const box = this.$(".hh"), list = this.$(".hl");
    box.hidden = hist.length === 0;
    if (!hist.length) { list.innerHTML = ""; return; }
    list.innerHTML = hist.map((h, i) => `
      <div class="hrow" data-i="${i}">
        <span class="ht">${esc(h.text.slice(0, 60))}${h.text.length > 60 ? "…" : ""}</span>
        <span class="hm">${h.dur} sn • ${h.size}</span>
        <button class="ghost hplay">${t().replay}</button>
        ${h.audio ? `<button class="ghost hdl">${t().dl}</button>` : ""}
        <button class="ghost hdel" title="${t().del}">×</button>
      </div>`).join("");
  }
  get events() {
    return {
      click: {
        ".say": () => this.onSay(),
        "details summary": (e) => { // akordeon: biri acilirken digerleri kapansin
          const d = e.target.closest("details");
          this.$$("details").forEach((x) => { if (x !== d && x.open) x.open = false; });
        },
        ".exb": (e) => {
          const tier = EXAMPLES[Number(e.target.dataset.i)] || EXAMPLES[0];
          let pick = tier[Math.floor(Math.random() * tier.length)];
          if (tier.length > 1) {
            for (let k = 0; k < 5 && pick === ui.text; k++)
              pick = tier[Math.floor(Math.random() * tier.length)];
          }
          ui.text = pick;
          this.$(".txt").value = pick;
        },
        ".dl": () => {
          const a = document.createElement("a");
          a.href = ui.audioURL; a.download = dlName(lastGenText || ui.text); a.click();
        },
        ".hplay": (e) => this.onHistPlay(Number(e.target.closest(".hrow").dataset.i)),
        ".hdl": (e) => this.onHistDl(Number(e.target.closest(".hrow").dataset.i)),
        ".hdel": (e) => {
          const i = Number(e.target.closest(".hrow").dataset.i);
          if (hist[i]) { hist.splice(i, 1); saveHist(); ui.histSeq++; }
        },
        ".dice": () => {
          ui.seed = Math.floor(Math.random() * 100000);
          prefs.seed = ui.seed; savePrefs();
          this.$(".seed").value = ui.seed;
        },
        ".sclr": () => clearCache(),
        ".sredl": () => redownload(),
        ".shist": () => clearHist(),
      },
      input: {
        ".txt": (e) => { ui.text = e.target.value; this.autosize(); },
      },
      keydown: {
        ".txt": (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); this.onSay(); }
        },
      },
      change: {
        ".spd": (e) => { ui.speed = parseFloat(e.target.value) || 1; prefs.speed = ui.speed; savePrefs(); },
        ".seed": (e) => {
          ui.seed = Math.max(0, parseInt(e.target.value) || 0);
          prefs.seed = ui.seed; savePrefs();
        },
        ".be": (e) => setBackend(e.target.value),
        ".theme": (e) => { prefs.theme = e.target.value; savePrefs(); applyTheme(); },
        ".langsel": (e) => { prefs.lang = e.target.value; savePrefs(); this.applyLang(); },
      },
    };
  }
  // Kelime kelime vurgulama: calan parcanin kelimeleri sirayla aydinlanir.
  paintNow(words, idx) {
    this.$(".now").innerHTML = words.map((w, i) =>
      `<span class="${i < idx ? "said" : i === idx ? "on" : ""}">${esc(w)}</span>`).join(" ");
    this.$(".out").hidden = false;
  }
  follow(id) {
    if (id !== runId || !PS) return;
    const t = AC.ctx.currentTime;
    const piece = PS.pieces.filter((x) => x.start <= t + 0.03).at(-1);
    if (piece && piece !== PS.shown) {
      PS.shown = piece; PS.word = -1;
      this.paintNow(piece.words, -1);
    }
    if (piece) {
      const rel = t - piece.start;
      let w = -1;
      for (let i = 0; i < piece.words.length; i++) if ((piece.starts[i] ?? Infinity) <= rel) w = i;
      if (rel > piece.seconds) w = piece.words.length;
      if (w !== PS.word) { PS.word = w; this.paintNow(piece.words, w); }
    }
    if (PS.done && t > PS.endAt + 0.15) {
      if (id !== runId || !PS) return;
      PS = null;
      ui.phase = "done";
      return;
    }
    requestAnimationFrame(() => this.follow(id));
  }
  async onSay() {
    if (ui.phase === "busy" || ui.phase === "playing") { stopAll(); return; } // Durdur
    if (ui.phase === "loading") return;
    if (!ui.text.trim()) { ui.phase = "error"; ui.status = t().err(t().empty); return; }
    try {
      const { ctx, master } = ensureCtx();
      await ctx.resume().catch(() => {});
      if (!sessText) await loadModels();
      stopAll();
      if (ui.audioURL) { URL.revokeObjectURL(ui.audioURL); ui.audioURL = ""; }
      this.$(".now").innerHTML = "";
      ui.phase = "busy"; ui.status = t().busy;
      const t0 = performance.now();
      const text = ui.text, speed = ui.speed, seed = ui.seed;
      const stats = {};
      const id = ++runId;
      const ps = PS = { sources: [], pieces: [], at: ctx.currentTime + 0.08, done: false, endAt: 0, shown: null, word: -1 };
      const sched = (samples) => {
        ctx.resume().catch(() => {});
        const buf = ctx.createBuffer(1, samples.length, RATE);
        buf.copyToChannel(samples, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(master);
        const start = Math.max(ps.at, ctx.currentTime + 0.02);
        src.start(start);
        ps.at = start + buf.duration; ps.endAt = ps.at;
        ps.sources.push(src);
        return start;
      };
      const chunks = [];
      let firstMs = null;
      for await (const part of synthPieces(text, speed, seed, stats)) {
        if (id !== runId) return; // durduruldu
        const start = sched(part.audio);
        ps.pieces.push({ words: part.words, starts: part.starts, seconds: part.seconds, start });
        chunks.push(part.audio);
        if (firstMs === null) {
          firstMs = performance.now() - t0;
          ui.phase = "playing"; ui.status = t().playing;
          setMediaText(text);
          requestAnimationFrame(() => this.follow(id));
        }
      }
      if (id !== runId) return;
      ps.done = true;
      const audio = concat(chunks);
      const blob = toWav(audio);
      ui.audioURL = URL.createObjectURL(blob);
      ui.audioSize = fmtMB(blob.size);
      const dur = (audio.length / RATE).toFixed(1);
      const el = (performance.now() - t0) / 1000;
      const rtf = Math.round(audio.length / RATE / Math.max(el, 0.01));
      lastGenText = text;
      hist.unshift({ text, speed, dur, size: ui.audioSize, audio });
      hist = hist.slice(0, 20);
      hist.forEach((h, i) => { if (i > 4) h.audio = null; }); // bellek: sesi sadece son 5 kayitta tut
      saveHist(); ui.histSeq++;
      ui.status = `${t().done(dur)} • ${t().first} ${Math.round(firstMs)} ms • ${rtf}×`;
      ui.stats = `${t().mText} ${Math.round(stats.text || 0)}ms • ${t().mSound} ${Math.round(stats.sound || 0)}ms • ${t().mDec} ${Math.round(stats.decode || 0)}ms`;
      ui.dlSeq++;
      if (ctx.currentTime > ps.endAt) { PS = null; ui.phase = "done"; }
    } catch (e) {
      ui.phase = "error"; ui.status = t().err(e.message);
    }
  }
  async onHistPlay(i) {
    if (ui.phase === "busy" || ui.phase === "playing" || ui.phase === "loading") return;
    const h = hist[i];
    if (!h) return;
    if (h.audio) {
      stopAll();
      if (ui.audioURL) URL.revokeObjectURL(ui.audioURL);
      ui.audioURL = URL.createObjectURL(toWav(h.audio));
      ui.audioSize = h.size;
      const { ctx, master } = ensureCtx();
      await ctx.resume().catch(() => {});
      const id = ++runId;
      const ps = PS = { sources: [], pieces: [], at: 0, done: true, endAt: 0, shown: null, word: -1 };
      const buf = ctx.createBuffer(1, h.audio.length, RATE);
      buf.copyToChannel(h.audio, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(master);
      ps.at = ctx.currentTime + 0.02;
      src.start(ps.at); ps.endAt = ps.at + buf.duration; ps.sources.push(src);
      ps.pieces.push({ words: h.text.split(" "), starts: [], seconds: h.audio.length / RATE, start: ps.at });
      setMediaText(h.text);
      ui.phase = "playing"; ui.status = t().playing;
      requestAnimationFrame(() => this.follow(id));
    } else {
      ui.text = h.text; this.$(".txt").value = h.text;
      ui.speed = h.speed; this.$(".spd").value = h.speed;
      this.onSay(); // ses yoksa (sayfa yenilenmis) bastan uret
    }
  }
  onHistDl(i) {
    const h = hist[i];
    if (!h || !h.audio) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(toWav(h.audio));
    a.download = dlName(h.text); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

new App().render(document.getElementById("app"));
