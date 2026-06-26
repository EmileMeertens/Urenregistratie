# Urenregistratie: Setup-gids

Volg deze stappen om je lokale uren-tracker app (`uren-tracker.html`) te koppelen aan Google Sheets. Geen ervaring met Google Apps Script nodig — dit document leidt je door alles heen.

---

## 1. Wat je nodig hebt

- Een Google account (gratis)
- De bestanden:
  - `uren-tracker.html` (de app zelf)
  - `Code.gs` (de koppeling naar Google Sheets)
- Een webbrowser (Chrome, Firefox, Safari, etc.)

---

## 2. Google Sheet aanmaken

1. Ga naar **sheets.google.com**
2. Klik **+ Nieuw** → **Spreadsheet**
3. Geef de spreadsheet een naam, bijvoorbeeld `"Urenregistratie"`
4. Klik **Maken**

Het script maakt automatisch een **tabblad per persoon** aan (genoemd naar het deel vóór de @ van hun UHasselt-mail, bv. `emile.meertens`) plus één gedeeld tabblad `"Maandoverzicht"`. Je hoeft zelf niets aan te maken of in te typen.

### Je Spreadsheet ID kopiëren

1. Kijk in de adresbalk van je browser
2. Je ziet iets als: `https://docs.google.com/spreadsheets/d/**LANG_STUK_HIER**/edit`
3. Dat lange stuk (tussen `/d/` en `/edit`) is je **Spreadsheet ID**
4. Kopieer dit ID en sla het ergens op (je hebt het zo nodig) -> 1zpWZqgBdvLC0iLL28bz1T3m4TvErXHgG662Ng1AiYW0

---

## 3. Google Apps Script-project aanmaken

1. Ga naar **script.google.com**
2. Klik **+ Nieuw project**
3. Je ziet een leeg script met wat standaardcode

### Code invoegen

1. Selecteer **al** de standaardcode (Ctrl+A / Cmd+A)
2. Verwijder het
3. Open het bestand `Code.gs` op je computer met een tekstverwerker
4. Kopieer **de hele inhoud**
5. Plak alles in het Google Apps Script-venster
6. Klik **Opslaan** (of Ctrl+S / Cmd+S)
7. Geef het project een naam, bijvoorbeeld `"Urentracker API"`

---

## 4. Spreadsheet ID koppelen

Je script moet weten welke Google Sheet het moet gebruiken. Dit doe je via een "Script Property".

### Makkelijkste manier (aanbevolen):

1. Ga naar **Projectinstellingen** (tandwiel-icoontje ⚙ rechtsbovenin)
2. Scroll naar **Scripteigenschappen**
3. Klik **Eigenschap toevoegen**
4. Vul in:
   - **Eigenschap:** `SPREADSHEET_ID`
   - **Waarde:** (plak hier je Spreadsheet ID van stap 2)
5. Klik **Opslaan**

Klaar! Het script vindt nu automatisch je Google Sheet.

### Wat gebeurt er als je het script voor het eerst runt?

Google vraagt om toestemming. Je ziet een waarschuwing: `"Deze app is niet geverifieerd"` → Klik **Geavanceerd** → **Toch doorgaan** (het is immers je eigen script, dus je kunt het vertrouwen).

---

## 5. Deployen als Web App

1. Klik **Implementeren** (rechtsboven, blauwe knop)
2. Kies **Nieuwe implementatie**
3. Bij **Type selecteren** kies je **Web-app**
4. Vul in:
   - **Beschrijving:** bijvoorbeeld `"Urentracker"`
   - **Uitvoeren als:** (laat je ingelogde Google account staan)
   - **Wie heeft toegang:** zet op **Iedereen** (Anyone)
5. Klik **Implementeren**
6. Google vraagt opnieuw om toestemming → autoriseer het
7. Je ziet nu een URL die eindigt op `/exec`

### Je Web App URL kopiëren

1. Kopieer die lange URL (de regel **Implementatie-URL**)
2. Sla hem op — je hebt hem meteen nodig -> https://script.google.com/macros/s/AKfycbzevXxcSexVfVg1wUCOfvSwOK7_LRJMVFGZ0nTJBEJLy7n3A9BO6W4_dx_zXHZf-749pA/exec

---

## 6. Koppelen in je app

1. **Open** `uren-tracker.html` in je webbrowser
   - Dubbelklik het bestand, of
   - Sleep het naar je browser, of
   - Klik rechtsklik → "Openen met" → je favoriete browser
2. Je ziet de app laden
3. Zoek het **tandwiel-icoontje** (⚙) rechtsboven
4. Klik erop → **Instellingen**
5. Je ziet:
   - **Web App URL:** plak hier je URL uit stap 5
   - **Adapter type:** zet op `"googlesheets"`
   - (De **Spreadsheet ID** vul je hier níét in — die staat centraal als Script
     Property `SPREADSHEET_ID`, zie stap 4. Zo hoeft niemand het ID in de app te kennen.)
6. Klik **Test verbinding**

**Als groen:**  
Succes! Je bent gekoppeld. Je kunt nu aan het werk.

**Als rood/fout:**  
Zie "Problemen oplossen" hieronder.

---

## 7. Veelvoorkomende problemen

### "Test verbinding faalt"

**Controleer stap voor stap:**

1. **URL:** eindigt deze op `/exec`? (niet `/dev` of `/edit`)
2. **Toegang:** ga terug naar script.google.com → Implementeren → Implementaties beheren → klik het potlood-icoontje → controleer "Wie heeft toegang: Iedereen"
3. **Oude code:** heb je het script gewijzigd nadat je het hebt gedeployed? Dan moet je opnieuw deployen!

### Opnieuw deployen na codewijziging

1. Ga naar script.google.com
2. Wijzig je `Code.gs`
3. Klik **Opslaan**
4. Klik **Implementeren** → **Implementaties beheren**
5. Klik het **potlood-icoontje** naast je bestaande web app
6. Bij **Versie** kies je **Nieuwe versie** (niet "Versie 1 opnieuw gebruiken"!)
7. Klik **Implementeren**
8. Autoriseer opnieuw

De app in je browser gebruikt nu de nieuwe code.

### "Geen data in Google Sheet"

1. Ga naar sheets.google.com en open je spreadsheet
2. Controleer: staat je **Spreadsheet ID** in de Script Properties?
   - script.google.com → Projectinstellingen → Scripteigenschappen
   - Staat daar `SPREADSHEET_ID = [je ID]`?

### "Sessies staan in de app, maar niet in Google Sheets"

1. Open de app
2. Klik het **tandwiel-icoontje** → scroll naar **Pending sync**
3. Als daar items in staan → klik **Pending doorsturen** (of wacht tot de app het automatisch doet)
4. Refresh Google Sheets om de nieuwe data te zien

**Belangrijk:** je gegevens worden altijd **lokaal opgeslagen** (in je browser), zelfs als de Sheets-koppeling tijdelijk niet werkt. Je verliest niks.

---

## 8. Je data beheren

- **Lokaal:** alles staat in `uren-tracker.html` (browseropslag)
- **Online:** dezelfde data synct naar Google Sheets, naar het tabblad met jouw naam plus het gedeelde `"Maandoverzicht"`
- **Backup:** het is altijd handig om je Google Sheet regelmatig te downloaden (Bestand → Downloaden → Excel)

---

## Klaar!

Je app werkt nu. Begin je eerste urensessie:

1. Open `uren-tracker.html`
2. Meld je aan met je UHasselt-e-mail, kies een taak
3. Start de timer
4. Klik **Uitklokken** als je klaar bent (je vult dan in waar je aan werkte)
5. Meteen daarna zie je het in Google Sheets (refresh de pagina)

Vragen? Controleer **stap 7 (Problemen oplossen)** — daar staat het antwoord waarschijnlijk al.

---

# Deel B — Multi-user: hosten op GitHub Pages voor alle studenten

Wil je dat **meerdere studenten** dezelfde app gebruiken en alle uren in één gedeelde Sheet terechtkomen (zodat de werkgever iedereen apart kan uitbetalen)? Dan host je de app online. Iedereen opent dan dezelfde link en meldt zich aan met zijn UHasselt-mail — elke student krijgt automatisch zijn eigen tabblad.

## B1. Hoe het werkt

- **Eén gedeelde Google Sheet + één Apps Script** (precies de setup uit Deel A).
- Elke student krijgt een **eigen tabblad**, genoemd naar het deel vóór de @ van zijn mail
  (`emile.meertens@student.uhasselt.be` → tabblad `emile.meertens`). Dit is uniek binnen
  UHasselt, dus twee studenten met dezelfde voornaam botsen nooit.
- Het tabblad **`Maandoverzicht`** verzamelt alle maandtotalen van **alle** studenten,
  met een kolom **Naam**. Dit is wat de werkgever bekijkt om uit te betalen.

## B2. Endpoint één keer instellen in de app

Zodat studenten niets technisch hoeven te doen, zet jij de Apps Script URL vast in de app:

1. Open `uren-tracker.html` in een teksteditor.
2. Zoek bovenaan het `CONFIG`-blok de regel:
   ```js
   endpointUrl: 'PLAK_HIER_DE_GEDEELDE_APPS_SCRIPT_URL',
   ```
3. Vervang de tekst tussen de quotes door jouw Web App URL (die op `/exec` eindigt).
4. Sla het bestand op.

> Stel de **Spreadsheet ID** in als Script Property (Deel A, stap 4), zodat het script
> weet naar welke Sheet het moet schrijven. Studenten hoeven dan helemaal niets in te stellen.

## B3. Gratis hosten op GitHub Pages

1. Maak een (gratis) account op **github.com**.
2. Klik **+ → New repository**. Geef een naam (bv. `urentracker`), zet op **Public**, klik **Create**.
3. Klik **Add file → Upload files**. Sleep je aangepaste `uren-tracker.html` erin, maar
   **hernoem het eerst naar `index.html`** (zo opent de site direct de app).
4. Klik **Commit changes**.
5. Ga naar **Settings → Pages**. Bij **Branch** kies je `main` en map `/ (root)` → **Save**.
6. Na ~1 minuut verschijnt bovenaan je publieke link, bv.
   `https://jouwnaam.github.io/urentracker/`. Deel die link met je collega-studenten.

## B4. Wat een student doet

1. De link openen (op gsm of laptop).
2. Zijn UHasselt-e-mailadres invoeren → klaar. Vanaf nu klokt hij gewoon in en uit.
3. De naam staat rechtsboven; via die knop kan hij het corrigeren als hij zich vertypte.

## B5. Belangrijk om te weten

- **Naam-consistentie:** omdat we het e-mailadres gebruiken (en enkel het deel vóór de @),
  belandt iedereen automatisch altijd in hetzelfde tabblad. Geen risico op dubbele tabbladen.
- **Cross-device:** bij aanmelden haalt de app automatisch je volledige historie uit de
  Google Sheet op. Klok je op je laptop in en open je later de app op je gsm, dan zie je
  daar al je eerdere sessies. De Google Sheet blijft de officiële administratie (die de
  werkgever ziet).
- **Code bijwerken:** wijzig je later de `Code.gs`? Vergeet dan niet **een nieuwe
  implementatieversie** te publiceren (zie stap 8), anders draait de oude code.

Veel sterkte met je uren!
