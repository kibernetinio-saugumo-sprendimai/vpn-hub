# SafeStack VPN Hub

Savarankiškai talpinamas VPN administravimo prototipas: React, Vite ir Node.js/Hono. Blink paskyros ir paslaugų nereikia.

Tailscale skiltis gauna tikrus įrenginius ir leidžia užbaigti jų rakto galiojimą. Apžvalga, klientai ir serverių regionai yra demonstraciniai; vietiniai pakeitimai saugomi naršyklėje ir realių VPN prieigų nekeičia.

## VPS / Docker

Reikia Docker su Compose ir HTTPS reverse proxy (Nginx, Caddy ar pan.).

1. `cp .env.example .env`
2. Sugeneruokite bent 16 simbolių administratoriaus slaptažodžio hash: `npm run password:hash` (Node.js >=22.12). Slaptažodis įvedant nerodomas. Jei Node nėra įdiegtas: `docker run --rm -it -v "$PWD/scripts:/scripts:ro" node:22-alpine node /scripts/password-hash.mjs`.
3. Gautą `ADMIN_PASSWORD_HASH` reikšmę įrašykite į `.env`. Nustatykite `PUBLIC_ORIGIN=https://jusu-domenas.lt` be galinio `/` ir `TAILSCALE_API_KEY`. Failui suteikite `chmod 600 .env` teises.
4. `docker compose up -d --build`
5. HTTPS reverse proxy nukreipkite į `http://127.0.0.1:3001`. Naršyklėje atidarykite savo domeną ir Tailscale skiltyje prisijunkite administratoriaus slaptažodžiu.

Pavyzdinė Caddy konfigūracija:

```caddyfile
vpn.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

`PUBLIC_ORIGIN` turi tiksliai sutapti su naršyklėje naudojamu protokolu, domenu ir prievadu. Produkcijos sesijai reikalingas HTTPS. Compose prievadas pasiekiamas tik iš VPS; viešą prieigą teikia reverse proxy. Tailscale raktas lieka serveryje. Naudokite tokeną su įrenginių skaitymo ir rakto galiojimo keitimo teisėmis.

Sesijos saugomos serverio atmintyje, galioja 8 valandas ir panaikinamos atsijungiant. Perkrovus serverį visi turės prisijungti iš naujo. Šis variantas skirtas vienam administratoriui ir vienai serverio instancijai. Visai instancijai leidžiama iki 10 prisijungimo bandymų per minutę.

## Vietinis paleidimas

```sh
npm ci
cp .env.example .env
npm run password:hash
```

Į `.env` įrašykite hash ir Tailscale raktą. Vietiniam darbui pakeiskite `PUBLIC_ORIGIN=http://localhost:3000` ir `NODE_ENV=development`.

Atskiruose terminaluose:

```sh
npm run dev:api
npm run dev
```

Atidarykite `http://localhost:3000`. Vite perduoda `/api` užklausas Node serveriui.

## Tikrinimas

```sh
npm run lint
npm test
npm run build
```

Be Docker: `npm run build`, tada `node --env-file=.env dist-server/server.js`. Frontend ir API aptarnaujami vienu serveriu, todėl tiesioginis `/app/tailscale` atidarymas veikia ir perkrovus puslapį. `GET /api/health` skirtas serverio būklei tikrinti.
