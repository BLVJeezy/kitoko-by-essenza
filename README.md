# Kitoko by Essenza

Eigen webshop en backend, Nederlands, met afhalen in Tongeren of Maasmechelen. Node.js 24, SQLite lokaal en Turso/libSQL voor Vercel. Responsive winkel, zoeken/categorieën, productdetails, winkelmand, testcheckout, beveiligd beheer, productfoto’s, prijzen, voorraad en aparte betaal-/afhaalstatussen.

## Lokaal starten

```sh
cd /workspace/kitoko-by-essenza
npm ci --cache /tmp/kitoko-npm-cache
npm test
npm start
```

De server gebruikt poort 3000 (`PORT` is instelbaar). Winkel op `/`, beheer op `/admin`. Dit is een concept met expliciete voorbeeldproducten en testbestellingen. Er worden geen betalingen of e-mails verstuurd. `LIVE_CHECKOUT=true` blokkeert checkout totdat de live-integratie is gerealiseerd; deze instelling activeert geen betaalprovider. `npm run build` controleert de uitvoerbare JavaScript-bestanden; de frontend is statisch.

## Beheeraccount

Er is bewust geen standaardwachtwoord. Stel `ADMIN_EMAIL` en `ADMIN_PASSWORD` (minimaal 12 tekens) veilig in de lokale procesomgeving in en voer `npm run admin` uit. Deel deze waarden niet in chat of Git. Het wachtwoord wordt met scrypt en een unieke salt gehasht. Opnieuw uitvoeren wijzigt het wachtwoord en trekt bestaande sessies in. Sessies verlopen na acht uur. Gebruik HTTPS en `NODE_ENV=production` voor Secure-cookies bij hosting.

## Producten en varianten

In beheer kun je producten aanmaken, wijzigen, verbergen, voorraad aanvullen en een JPEG/PNG/WebP-foto van maximaal 2 MB toevoegen. Een verkoopbare inhoud/variant heeft zijn eigen productregel, prijs en voorraad. Foto’s worden lokaal in SQLite opgeslagen; illustraties zijn tijdelijke placeholders, geen leverancierfoto’s.

Een geverifieerde catalogus kan herhaalbaar worden geïmporteerd:

```sh
node scripts/import-products.js /pad/naar/catalogus.json
```

Formaat: een JSON-lijst met `name`, `category`, `description`, `price` (integer eurocenten), `stock` (integer), `size`, optioneel `color` en `image` (PNG/JPEG/WebP data-URL). Identieke naam + inhoud worden bijgewerkt. Andere producten worden behouden: verberg voorbeeldproducten expliciet in beheer na import. Het importscript verzint geen voorraad of prijzen. Maak voor imports een backup.

## Bestellingen

Prijzen komen altijd uit de database; de server vertrouwt geen clienttotalen. De voorraad wordt binnen één SQLite-transactie gereserveerd. Dubbele productregels worden samengevoegd voor voorraadcontrole. Afhaalplaatsen worden server-side beperkt tot Tongeren en Maasmechelen.

Betaling: niet betaald, betaald, terugbetaald. Afhalen: in behandeling, klaar om af te halen, afgehaald, geannuleerd. Annuleren herstelt de voorraad exact één keer; geannuleerde bestellingen kunnen niet heropend worden. Afgehaalde orders kunnen niet geannuleerd worden. Handmatig terugbetaald markeren voert geen echte terugbetaling uit. Voorraad bij retouren moet bewust handmatig worden aangepast.

## Opslag en hosting

`DB_PATH` is standaard `data/kitoko.sqlite`. Bewaar de database op een persistent volume. Op Vercel gebruikt de app verplicht een externe Turso-database. Zie [DEPLOYMENT.md](DEPLOYMENT.md). Transacties, sessies en inloglimieten gebruiken gedeelde opslag. Back-up SQLite met de SQLite backup-API, of stop de server en kopieer de hele data-map inclusief eventuele WAL-bestanden. Test herstel voordat je live gaat. Geen database, accounts of secrets in Git.

## Validatie en openstaande lancering

`npm test` controleert authenticatie, serverprijzen, voorraadtransacties, afhaalplaats en bestelstatussen. Browsercontroles zijn uitgevoerd met Chromium op desktop en mobiel, inclusief een testbestelling.

Nog nodig vóór een echte lancering:

- Volledige geverifieerde productcatalogus, prijzen en afbeeldingen. De referentiesite en Instagram gaven tijdens uitvoering netwerk-403; gebruiksrechten zijn door de opdrachtgever bevestigd.
- Het originele logo als bruikbaar afbeeldingsbestand; het huidige woordmerk en productillustraties zijn een ontwerpvoorstel.
- Definitieve bedrijfsgegevens, contact-e-mail, afhaaladressen en afspraken/openingstijden.
- Besluit over betalen bij afhalen/online; betaalprovider met webhookverificatie, idempotente orderaanmaak en betaalreconciliatie voor online betaling.
- E-mailprovider en geverifieerd afzenderdomein voor bestel- en afhaalbevestigingen.
- Juridische informatie afgestemd op de werkelijke onderneming: privacy, voorwaarden en herroepings-/retourbeleid.
- Productiehosting, domein, HTTPS, backupbeleid, beheeraccount en live end-to-end acceptatietest.

Deze repository is een werkende testversie, geen gepubliceerde productie-webshop.

## Vercel

De serverless entrypoint staat in `api/index.js`, routing in `vercel.json`. De lokale server blijft beschikbaar via `npm start`. De daadwerkelijke Vercel-deployment en externe database zijn nog niet geverifieerd: daarvoor ontbreken accounttoegang en databasecredentials. Zie [DEPLOYMENT.md](DEPLOYMENT.md) voor de concrete configuratie.
