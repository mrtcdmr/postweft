# social-autopilot

[English](README.md)

Küçük bir markanın Instagram ve Threads hesaplarını, sosyal medya asistanın olarak
[Claude Code](https://claude.com/claude-code) ile yönetmek için ücretsiz ve açık kaynak (MIT) bir araç seti.

- **HTML'den video.** Basit HTML şablonlarından dikey 1080x1920 video, kare kare üretilir. Telifsiz müzik üretici,
  isteğe bağlı seslendirme ve kelime kelime altyazı içerir.
- **En iyi saatlerde paylaşım kuyruğu.** Her paylaşım küçük bir JSON dosyasıdır. Senin "en iyi saatler" tablondaki ilk
  boş zamana yerleşir, cron zamanı gelince yayınlar.
- **Düşünerek cevap.** Claude kendi gönderilerine gelen yorumlara ve Instagram DM'lerine cevap verir. Şikâyet, iş
  teklifi ve emin olmadığı her şey telefonuna bildirim olarak gelir.
- **Claude Code becerisi (skill).** Claude'a çalışma düzenini öğretir: planla, yaz, videoyu üret, sana göster, sadece
  sen "evet" deyince yayınla.

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

1. **config.json**: saat dilimi, marka dili (ör. `"Turkish"`), Instagram kullanıcı numarası, dosya barındırma, ntfy konusu.
2. **.env**: uzun ömürlü anahtarların. Dosyayı kendin düzenle, anahtarları sohbete yapıştırma.
3. **brand.md**: cevap botunun kullanabileceği bilgiler. Burada olmayan soru tahmin edilmez, sana gelir.
4. **slots.json**: ne zaman paylaşılacağı. Örnek saatler sadece yer tutucudur, kendi hesap istatistiklerini kullan.
5. **Beceri**: `mkdir -p ~/.claude/skills && cp -r skill/social-autopilot ~/.claude/skills/`. Sonra Claude Code'a
   *"gelecek haftayı planla"*, *"yeni ürünümüz için bir Reels yap"*, *"yarın ne paylaşılacak?"* gibi şeyler söyle.
6. **Cron**: `examples/crontab.txt` dosyasına bak.

Gereken her şey, komutlar ve kendi şablonunu yapma: [README.md](README.md).

## Hesapsız dene

```bash
cp -r video/templates/starter work/demo
bash video/build.sh work/demo          # -> work/demo.mp4 ve kapak work/demo.jpg (sadece müzik, ~1 dakika)
```

Altyazı dili için: `CAPTION_LANG=tr bash video/build.sh work/demo`.

## Lisans

MIT. Katkılar memnuniyetle karşılanır. Markadan bağımsız ve resmî API'lerde kalsın.
