# SafeStack VPN Hub

Savarankiškai talpinamas Tailscale VPN tinklo (tailnet) administravimo centras: React, Vite, TanStack Router/Query ir Node.js/Hono.

Visa valdymo aplinka apsaugota administratoriaus slaptažodžiu ir dirba su tikrais Tailscale API v2 duomenimis:
- **Apžvalga** – tikro laiko tailnet būsena, prisijungę įrenginiai, OS pasiskirstymas, DERP vėlinimas ir paskutinis aktyvumas.
- **Įrenginiai** – paieška, filtravimas, naujų įrenginių patvirtinimas (`authorize`), raktų galiojimo keitimas (`keyExpiryDisabled`), skubus rakto atšaukimas (`expire`), subnet/Exit Node maršrutų valdymas ir įrenginių šalinimas.
- **Mazgai ir maršrutai** – Exit Node mazgų, subnet maršrutizatorių, ACL žymėtų serverių (`tag:*`) ir DERP relėjų regionų stebėsena bei maršrutų tvirtinimas.
- **Naudotojai** – realių tailnet naudotojų bei paslaugų tapatybių suvestinė pagal prijungtus įrenginius.

## Reikalingos Tailscale API rakto teisės

Tailscale administravimo konsolėje (**Settings → Keys → Generate access token**) sukurkite API raktą su šiomis teisėmis:
- `Devices → Core` (**Write**) – įrenginių sąrašui, patvirtinimui, rakto galiojimui ir šalinimui.
- `Devices → Routes` (**Write**) – subnet maršrutų ir Exit Node tvirtinimui.

## Diegimas VPS serveryje (Docker Compose)

Reikia Docker su Compose ir HTTPS reverse proxy (Caddy, Nginx ar pan.).

1. Nukopijuokite pavyzdinę konfigūraciją:
   ```sh
   cp .env.example .env
   chmod 600 .env
   ```
2. Sugeneruokite bent 16 simbolių administratoriaus slaptažodžio maišą (`scrypt`):
   ```sh
   npm run password:hash
   ```
   *(Jei Node.js serveryje neįdiegtas: `docker run --rm -it -v "$PWD/scripts:/scripts:ro" node:22-alpine node /scripts/password-hash.mjs`)*
3. Į `.env` įrašykite:
   - `ADMIN_PASSWORD_HASH=...`
   - `PUBLIC_ORIGIN=https://vpn.jusu-domenas.lt` (tikslus HTTPS adresas be galinio `/`)
   - `TAILSCALE_API_KEY=tskey-api-...`
4. Paleiskite konteinerį:
   ```sh
   docker compose up -d --build
   ```
5. Nukreipkite HTTPS reverse proxy į `http://127.0.0.1:3001`. Pavyzdys su Caddy:
   ```caddyfile
   vpn.jusu-domenas.lt {
       reverse_proxy 127.0.0.1:3001
   }
   ```

### Saugumo savybės
- `HttpOnly`, `SameSite=Strict`, `Secure` sesijos slapukai (galioja 8 val., saugoma SHA-256 maiša serverio atmintyje).
- Griežta `Origin` patikra visiems keičiantiems API kvietimams ir `Content-Security-Policy` be `unsafe-inline` skriptų.
- Prisijungimo bandymų ribojimas pagal IP adresą (kai `TRUST_PROXY=true` už vietinio reverse proxy) bei bendras limitas.
- Konteineris veikia neprivilegijuotu `node` naudotoju su `read_only: true`, `cap_drop: [ALL]` ir `no-new-privileges`.

## Vietinis kūrimas ir paleidimas

Reikalinga **Node.js >= 22.12**.

```sh
npm ci
cp .env.example .env
npm run password:hash
```

Vietiniam darbui `.env` faile nustatykite:
```dotenv
PUBLIC_ORIGIN=http://localhost:3000
NODE_ENV=development
ADMIN_PASSWORD_HASH=...
TAILSCALE_API_KEY=tskey-api-...
```

Paleiskite dviejuose terminaluose:
```sh
npm run dev:api
npm run dev
```

Atidarykite `http://localhost:3000` – Vite automatiškai perduoda `/api` užklausas į `http://127.0.0.1:3001`.

## Kokybės ir saugumo patikra

```sh
npm run build
npm run lint
npm test
```

Paleidimas produkcijos režimu be Docker:
```sh
npm run build
npm start
```
`GET /api/health` grąžina `{"ok":true}` serverio būklės stebėsenai.
