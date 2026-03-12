# DEGISIKLIKLER - HTTPS Zorunlulugu Guvenlik Duzeltmesi

> [English](./CHANGES.md) | Turkce

## Sorun
**KRITIK: Eksik HTTPS Zorunlulugu**

Uygulamada `.env.example` dosyasinda `ENABLE_SECURITY_HEADERS` ve `HSTS_MAX_AGE` tanimli olmasina ragmen middleware'de uygulanmamisti. Bu durum API'yi su risklere acik birakiyordu:
- HTTP uzerinden duz metin olarak iletilen token'lar
- API anahtarlarina yonelik ortadaki adam (MITM) saldirilari
- Protokol dusurme saldirilarina izin veren eksik HSTS basliklari

---

## Degisiklik Yapilan Dosyalar

| Dosya | Degisiklik Turu | Aciklama |
|-------|-----------------|----------|
| `packages/platform/src/middleware/security-headers.ts` | **Eklendi** | HTTPS zorunlulugu, HSTS ve guvenlik basliklarini uygulayan yeni middleware |
| `packages/platform/src/middleware/index.ts` | **Guncellendi** | Guvenlik basliklari middleware'i middleware zincirine entegre edildi |
| `.env.example` | **Guncellendi** | HTTPS zorunlulugu icin yeni yapilandirma secenekleri eklendi |

---

## Yeni Ortam Degiskenleri

| Degisken | Varsayilan | Aciklama |
|----------|------------|----------|
| `ENFORCE_HTTPS` | `true` | HTTP'yi HTTPS'e yonlendir (sadece production) |
| `ENABLE_SECURITY_HEADERS` | `true` | Tum guvenlik basliklarini etkinlestir/devre disi birak |
| `HSTS_MAX_AGE` | `31536000` | HSTS max-age saniye cinsinden (1 yil) |
| `HSTS_INCLUDE_SUBDOMAINS` | `true` | HSTS politikasina alt alan adlarini dahil et |
| `HSTS_PRELOAD` | `false` | HSTS onyklemeyi etkinlestir (alan adi gonderimi gerektirir) |
| `CSP_DIRECTIVES` | (kisitlayici varsayilan) | Ozel Icerik Guvenlik Politikasi |

---

## Uygulanan Guvenlik Basliklari

1. **HTTPS Zorunlulugu** - Production'da tum HTTP isteklerini HTTPS'e yonlendirir
2. **Strict-Transport-Security (HSTS)** - Tarayicilari gelecekteki isteklerde HTTPS kullanmaya zorlar
3. **X-Content-Type-Options** - MIME tipi koklama saldirilarini onler
4. **X-Frame-Options** - Clickjacking saldirilarini onler
5. **X-XSS-Protection** - Eski tarayicilarda XSS filtrelemeyi etkinlestirir
6. **Referrer-Policy** - Referrer bilgi sizintisini kontrol eder
7. **Permissions-Policy** - Gereksiz tarayici ozelliklerini devre disi birakir
8. **Content-Security-Policy** - API yanitlari icin kisitlayici CSP
9. **X-DNS-Prefetch-Control** - DNS on yuklemesini devre disi birakir
10. **X-Download-Options** - IE'nin indirmeleri calistirmasini onler
11. **X-Permitted-Cross-Domain-Policies** - Adobe Flash/PDF politikalarini kisitlar

---

## Beklenen Davranis

### Gelistirme Ortaminda (`NODE_ENV=development`)
- HTTPS zorunlulugu **devre disi** (yerel gelistirme icin HTTP'ye izin verir)
- Guvenlik basliklari yine de uygulanir
- HSTS basligi sadece HTTPS isteklerinde ayarlanir

### Production Ortaminda (`NODE_ENV=production`)
- Tum HTTP istekleri **HTTPS'e yonlendirilir** (301 yonlendirme)
- HSTS basligi tum yanitlarda ayarlanir
- Tam guvenlik basliklari uygulanir

### Saglik Kontrolu Endpoint'leri
- `/health`, `/live`, `/ready` endpoint'leri izleme araclarinin calismasi icin HTTPS yonlendirmesini atlar

---

## Nasil Dogrulanir

### 1. HTTPS Yonlendirmesini Kontrol Et (Production)
```bash
# 301 yonlendirmesi dondurmeli
curl -I http://your-domain.com/api/v1/health
```

### 2. Guvenlik Basliklarini Kontrol Et
```bash
# HSTS dahil tum guvenlik basliklarini gostermeli
curl -I https://your-domain.com/api/v1/health
```

Yanittaki beklenen basliklar:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

### 3. Tarayici DevTools'da Test Et
1. DevTools > Network sekmesini ac
2. Herhangi bir API istegi yap
3. Yanit Basliklarinda guvenlik basliklarini kontrol et

---

## Commit Mesajlari

```
feat(platform): add HTTPS enforcement middleware

fix(platform): integrate security headers into middleware chain

docs: add HTTPS enforcement configuration to .env.example
```
