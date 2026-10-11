# Publiceren op Vercel

De repository is voorbereid voor Vercel met Node.js 24.x, statische bestanden in `public/` en een Node Function voor `/api/*`. De eigen backend blijft behouden. Een externe Turso-database bewaart producten, afbeeldingen, bestellingen, accounts, sessies en inloglimieten. Zonder database toont de eerste deployment een expliciete demonstratie met vaste voorbeeldproducten; bestellen en beheerwijzigingen geven HTTP 503 en zijn uitgeschakeld. Een lokale SQLite-database op Vercel wordt bewust geweigerd: de filesystem-opslag daar is niet duurzaam.

## Nog benodigde toegang

- Vercel-accounttoegang. In deze cloudomgeving is `vercel whoami` uitgevoerd: uitgelogd. Er was geen bestaande Vercel-configuratie of geïnjecteerde tokenbinding.
- De Vercel-API (`api.vercel.com`) gaf netwerk-403. `api.vercel.com` en `vercel.com` zijn toegevoegd aan de cloudconceptconfiguratie. Opslaan van het concept activeert deze netwerktoegang niet automatisch.
- Een Turso-database met URL en authenticatietoken. De URL bevat geen wachtwoord; deel tokens nooit in chat of Git. Bewaar waarden veilig in Vercels Environment Variables en, voor beheer vanaf deze machine, via de omgevingsinstellingen.
- De cloudconceptconfiguratie bevat een vereiste `VERCEL_TOKEN` voor `api.vercel.com` en een variabele `TURSO_DATABASE_URL`. De specifieke Turso-host moet bekend zijn voordat een gerichte netwerk-/secretbinding kan worden vastgelegd.

De opdrachtgever heeft het bestaande Vercel-project `kitoko-by-essenza` onder `blvjeezys-projects` bevestigd, gekoppeld aan GitHub. Een push naar `main` triggert de productie-deployment. De daadwerkelijke deploymentstatus en publieke URL moeten nog worden geverifieerd. Publiceer de cloudomgeving niet alsof dit de website publiceert: dat zijn afzonderlijke acties.

## Vercel-projectinstellingen

- Framework preset: Other.
- Node.js: 24.x.
- Install: `npm ci`.
- Build: `npm run build`.
- Output directory: `public`.
- Routing en functionconfiguratie: `vercel.json`.

Vercel Environment Variables, voor de beoogde Preview/Production-omgeving:

| Naam                 | Inhoud                                                  |
| -------------------- | ------------------------------------------------------- |
| `TURSO_DATABASE_URL` | De database-URL van Turso (`libsql://…` of `https://…`) |
| `TURSO_AUTH_TOKEN`   | Turso-toegangstoken, veilig als secret opslaan          |
| `NODE_ENV`           | `production`                                            |

Laat `LIVE_CHECKOUT` weg: de huidige app ondersteunt uitsluitend duidelijk gemarkeerde testbestellingen. `LIVE_CHECKOUT=true` blokkeert de checkout; het activeert geen betaalprovider. Gebruik een aparte database voor een publieke demo en echte klantgegevens. De lege demodatabase wordt met vier voorbeeldproducten gevuld. Een bestaande lokale database wordt niet automatisch naar Turso gekopieerd.

## Beheeraccount en catalogus

Stel vóór het maken van het beheeraccount de bedoelde Turso-URL/token veilig in de shellomgeving in, samen met `ADMIN_EMAIL` en `ADMIN_PASSWORD`. Voer dan `npm run admin` uit. Het wachtwoord wordt alleen gehasht opgeslagen. Gebruik geen voorbeeldwachtwoord. Een wachtwoord opnieuw instellen trekt bestaande sessies in.

Gebruik `node scripts/import-products.js /pad/catalogus.json` voor een gecontroleerde import met geverifieerde prijzen en voorraad. Verberg daarna de voorbeeldproducten in beheer. Deel nooit de lokale `data/`-map in een deployment; `.vercelignore` sluit deze uit.

## Deployment zodra toegang beschikbaar is

Vanuit `/workspace/kitoko-by-essenza`:

```sh
npm ci
npm run build
npm test
vercel link
vercel deploy
```

Een geauthenticeerde Vercel-CLI of een Vercel-project gekoppeld aan de GitHub-repository is vereist. Controleer eerst de preview, daarna kan de productie-deployment worden gestart met `vercel deploy --prod`. De CLI geeft na een geslaagde deployment de echte URL terug. Publiceer geen verzonnen of onbevestigde URL.

Controleer op de daadwerkelijke URL: homepage, catalogus, login, productwijziging, testbestelling, voorraad, betaal-/afhaalstatus en persistentie na herladen. De serverless handler is lokaal getest met een door Vercel voorgeparseerde JSON-body; de gehoste Turso/Vercel-combinatie moet nog getest worden zodra toegang beschikbaar is.

## Nog geen echte verkoop

De geverifieerde catalogus, originele logoafbeelding, bedrijfs-/afhaalgegevens, betaalkeuze, betaalprovider, e-mailprovider en juridische pagina’s zijn nog niet compleet. De deployment betreft voorlopig een testversie, geen afgeronde livewinkel.
