# social-autopilot

[English](README.md)

Küçük bir markanın Instagram ve Threads hesaplarını bir yapay zekâ asistanıyla yönetmek için ücretsiz ve açık kaynak
(MIT) bir araç seti. **Claude Code, OpenAI Codex ve Google Antigravity / Gemini CLI** ile çalışır; aralarında
geçiş de yapabilirsin.

- **HTML'den video.** Basit HTML şablonlarından dikey 1080x1920 video, kare kare üretilir. Telifsiz müzik üretici,
  seslendirme (ElevenLabs, OpenAI, Gemini ya da bilgisayardaki bir seslendirme programı) ve kelime kelime altyazı içerir.
- **En iyi saatlerde paylaşım kuyruğu.** Her paylaşım küçük bir JSON dosyasıdır. Senin "en iyi saatler" tablondaki ilk
  boş zamana yerleşir, cron zamanı gelince yayınlar.
- **Düşünerek cevap.** Seçtiğin yapay zekâ (Claude, Codex, Gemini ya da herhangi bir komut) kendi gönderilerine
  gelen yorumlara ve Instagram DM'lerine cevap verir. Şikâyet, iş
  teklifi ve emin olmadığı her şey telefonuna bildirim olarak gelir.
- **Her asistan için tek kılavuz.** `AGENTS.md` (Codex, Antigravity, Cursor...), `CLAUDE.md` ve `GEMINI.md` aynı
  çalışma düzenini yükler: planla, yaz, videoyu üret, sana göster, sadece sen "evet" deyince yayınla. Ortak
  `HANDOFF.md` devir notu sayesinde hafta ortasında asistan değiştirebilirsin (ör. birinin kotası bitince).

Her şey **resmî** Instagram Graph API ve Threads API ile çalışır. Tarayıcı otomasyonu, veri kazıma, otomatik takip ve
yabancıların gönderilerine yorum yoktur. Bunlar hesap kapattırır ve spam'dir.

> Durum: erken sürüm. Kod, gerçek bir markanın hesaplarını her gün yöneten bir düzenden çıkarıldı ve markadan bağımsız
> olacak şekilde yeniden yazıldı. Bir betiği cron'a koymadan önce ne yaptığını oku ve `--dry` (deneme) modlarıyla başla.

## Kurulum

```bash
git clone https://github.com/mrtcdmr/social-autopilot.git
cd social-autopilot
npm install
npx playwright install chromium

mkdir -p ~/.config/social-autopilot
cp config/config.example.json ~/.config/social-autopilot/config.json
cp config/slots.example.json  ~/.config/social-autopilot/slots.json
cp config/env.example         ~/.config/social-autopilot/.env && chmod 600 ~/.config/social-autopilot/.env
cp prompts/brand.example.md   ~/.config/social-autopilot/brand.md
```

1. **config.json**: saat dilimi, marka dili (ör. `"Turkish"`), Instagram kullanıcı numarası, dosya barındırma, ntfy
   konusu ve cevap botunun yapay zekâsı `ai.provider`: `claude` (varsayılan), `codex`, `gemini` (`GEMINI_API_KEY`
   gerekir) ya da `command` (istemi alıp cevabı yazan herhangi bir program, ör. yerel bir model).
2. **.env**: uzun ömürlü anahtarların. Dosyayı kendin düzenle, anahtarları sohbete yapıştırma.
3. **brand.md**: cevap botunun kullanabileceği bilgiler. Burada olmayan soru tahmin edilmez, sana gelir.
4. **slots.json**: ne zaman paylaşılacağı. Örnek saatler sadece yer tutucudur, kendi hesap istatistiklerini kullan.
5. **Asistanın**: depo klasörünü Claude Code, Codex ya da Antigravity'de aç; `CLAUDE.md`, `AGENTS.md` ya da
   `GEMINI.md` dosyasını kendisi okur. Claude Code için beceriyi her yerde kullanmak istersen:
   `mkdir -p ~/.claude/skills && cp -r skill/social-autopilot ~/.claude/skills/`. Sonra *"gelecek haftayı planla"*,
   *"yeni ürünümüz için bir Reels yap"*, *"yarın ne paylaşılacak?"* gibi şeyler söyle.
6. **Cron**: `examples/crontab.txt` dosyasına bak.

Gereken her şey, komutlar ve kendi şablonunu yapma: [README.md](README.md).

## Hesapsız dene

```bash
cp -r video/templates/starter work/demo
bash video/build.sh work/demo          # -> work/demo.mp4 ve kapak work/demo.jpg (sadece müzik, ~1 dakika)
```

Altyazı dili için: `CAPTION_LANG=tr bash video/build.sh work/demo`.

## Seslendirme

`config.json` içindeki `voice` bölümünü bir kez ayarla, her video `LINES` metinlerinden kendiliğinden seslendirilsin:

- `elevenlabs`: `voiceId` (ElevenLabs ses kütüphanendeki sesin numarası), `model`, `language`, `speed`, `stability`. Anahtar: `ELEVENLABS_API_KEY`.
- `openai`: `voice` (ör. `alloy`), `model`, `instructions` (ton, ör. "sıcak ve neşeli"), `speed`. Anahtar: `OPENAI_API_KEY`.
- `gemini`: `voice` (ör. `Kore`), `model`, `instructions`. Anahtar: `GEMINI_API_KEY`.
- `command`: metni alıp `{out}` dosyasına ses yazan herhangi bir yerel program (ör. Piper). Anahtar gerekmez.
- `none`: seslendirme yok (varsayılan).

Bir videoya özel ses ya da hız için o videonun `timeline.mjs` dosyasına `export const VOICE = { ... }` yaz. Metin ya da
ayar değişmedikçe aynı satır yeniden üretilmez; `voice/<i>.wav` olarak kendin koyduğun kayıtların üzerine yazılmaz.
Bir satır kendi süresine sığmazsa derleme seni uyarır. Önce sadece sesi dinlemek için: `node video/voice.mjs work/demo`.

## Lisans

MIT. Katkılar memnuniyetle karşılanır. Markadan bağımsız ve resmî API'lerde kalsın.
