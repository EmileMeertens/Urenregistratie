/**
 * ============================================================
 * URENREGISTRATIE — Google Apps Script (Web App)
 * ============================================================
 *
 * SETUP-INSTRUCTIES (eenmalig uitvoeren):
 *
 * 1. Open je Google Spreadsheet en kopieer de ID uit de URL:
 *    https://docs.google.com/spreadsheets/d/[DIT_IS_JE_ID]/edit
 *
 * 2. Plak dit script in script.google.com (menu: Extensies → Apps Script
 *    of ga rechtstreeks naar script.google.com → nieuw project).
 *
 * 3. Voer éénmalig de functie `setSpreadsheetId` uit met jouw ID:
 *    - Klik boven in het script op de dropdown naast "Uitvoeren"
 *    - Kies `setSpreadsheetId`
 *    - Pas de ID-waarde aan in de functie hieronder en klik Uitvoeren
 *    (Je hoeft dit maar één keer te doen; de waarde wordt opgeslagen
 *     in de Script Properties van dit project.)
 *
 * 4. Deploy als Web App:
 *    - Klik op "Implementeren" → "Nieuwe implementatie"
 *    - Type: Webtoepassing
 *    - Uitvoeren als: Ik (jouw Google-account)
 *    - Toegang: Iedereen
 *    - Klik "Implementeren" en kopieer de Web App URL
 *
 * 5. Stel in de lokale uren-tracker de Web App URL in als POST-endpoint.
 *
 * ============================================================
 */

// ============================================================
// CONFIGURATIE — pas de ID hieronder aan vóór je setSpreadsheetId uitvoert
// ============================================================

/**
 * Voer deze functie EENMALIG uit om je Spreadsheet ID op te slaan.
 * Vervang de string hieronder door jouw eigen Spreadsheet ID.
 */
function setSpreadsheetId() {
  var id = 'PLAK_HIER_JE_SPREADSHEET_ID'; // <-- vervang dit
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id);
  Logger.log('Spreadsheet ID opgeslagen: ' + id);
}

// ============================================================
// CONSTANTEN
// ============================================================

// Versie-stempel — zichtbaar via doGet, zodat je kunt controleren welke code
// daadwerkelijk gedeployed is. Hoog dit op bij elke wijziging.
var CODE_VERSION      = 'v8-crossdevice';

var SHEET_SESSIES     = 'Sessies'; // alleen nog fallback voor payload zonder userId
var SHEET_MAAND       = 'Maandoverzicht';

var HEADERS_SESSIES   = ['Datum', 'Dag', 'Sessie #', 'Inkloktijd', 'Uitkloktijd', 'Duur sessie', 'Dagtotaal', 'Werk'];
var HEADERS_MAAND     = ['Maand', 'Naam', 'Werkdagen', 'Totale uren', 'Gemiddelde uren per dag'];

// Tabnamen die NOOIT een persoonlijk tabblad mogen worden
var GERESERVEERDE_TABS = { 'maandoverzicht': true };

/** Nederlandse maandnamen → maandnummer (1-gebaseerd) voor chronologische sortering */
var MAAND_NUMMERS = {
  'Januari':   1,
  'Februari':  2,
  'Maart':     3,
  'April':     4,
  'Mei':       5,
  'Juni':      6,
  'Juli':      7,
  'Augustus':  8,
  'September': 9,
  'Oktober':   10,
  'November':  11,
  'December':  12
};

// ============================================================
// HEALTH CHECK
// ============================================================

/**
 * GET-endpoint.
 * - Zonder parameters: health check + sheet-test (voor "Test verbinding").
 * - Met ?action=log&userId=...: geeft alle sessies van die gebruiker terug,
 *   zodat de app de historie op elk toestel kan ophalen (cross-device sync).
 */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};

  // De spreadsheet wordt centraal bepaald via Script Property SPREADSHEET_ID.
  var ss;
  try { ss = getSpreadsheet(null); } catch (err) { ss = null; }

  // --- Cross-device: log van één gebruiker ophalen ---
  if (p.action === 'log') {
    if (!p.userId) return jsonResponse({ success: false, error: 'userId ontbreekt.' });
    if (!ss)       return jsonResponse({ success: false, error: 'Spreadsheet niet gevonden (stel SPREADSHEET_ID in).' });
    try {
      return jsonResponse({ success: true, sessions: getUserLog_(ss, p.userId) });
    } catch (err) {
      return jsonResponse({ success: false, error: 'Kon log niet lezen: ' + err.message });
    }
  }

  // --- Standaard: health check (+ sheet-test) ---
  var result = {
    success: true,
    status:  'ok',
    service: 'urentracker',
    version: CODE_VERSION,
    time:    new Date().toISOString()
  };
  if (ss) {
    result.spreadsheet = ss.getName();
    result.sheetOk = true;
  } else {
    result.sheetOk = false;
    result.warning = 'Endpoint werkt, maar geen spreadsheet gevonden. Stel de Script Property SPREADSHEET_ID in.';
  }

  return jsonResponse(result);
}

/**
 * Leest alle sessies van één gebruiker uit diens tabblad en geeft ze terug als
 * array van session-objecten (zelfde vorm als de app gebruikt).
 *
 * @param  {Spreadsheet} ss
 * @param  {string}      userId
 * @return {Array<Object>}
 */
function getUserLog_(ss, userId) {
  var tab = userTabNaam_(userId);
  if (!tab) return [];
  var sheet = ss.getSheetByName(tab);
  if (!sheet) return []; // gebruiker heeft nog geen sessies

  var data = sheet.getDataRange().getValues();
  var sessions = [];
  for (var r = 1; r < data.length; r++) {
    var rij = data[r];
    var datum = normalizeDatum_(rij[0]);
    if (!datum) continue;
    var maandInfo = maandLabelUitDatum_(datum); // "Juni 2026"
    sessions.push({
      userId:   tab,
      date:     datum,                       // dd/mm/yyyy
      day:      String(rij[1] || ''),
      session:  Number(rij[2]) || 0,
      clockIn:  String(rij[3] || ''),
      clockOut: String(rij[4] || ''),
      duration: Number(rij[5]) || 0,
      dayTotal: (rij[6] === '' || rij[6] === null) ? 0 : (Number(rij[6]) || 0),
      month:    maandInfo,
      note:     String(rij[7] || '')
    });
  }
  return sessions;
}

// ============================================================
// HOOFD POST-HANDLER
// ============================================================

/**
 * POST-endpoint: ontvangt een sessie-registratie en schrijft naar Google Sheets.
 *
 * Verwachte JSON body:
 * {
 *   "date":      "25/06/2026",   // dd/mm/yyyy
 *   "day":       "do",           // nl dagafkorting
 *   "session":   1,              // sessienummer binnen de dag
 *   "clockIn":   "09:00",        // HH:MM
 *   "clockOut":  "12:30",        // HH:MM
 *   "duration":  3.50,           // decimale uren
 *   "dayTotal":  3.50,           // dagtotaal (payload, ter referentie)
 *   "month":     "Juni 2026"     // Nederlandse maandnaam + jaar
 * }
 */
function doPost(e) {
  try {
    // --- 1. Parse payload ---
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'Geen POST-body ontvangen.' });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: 'Ongeldige JSON in POST-body: ' + parseErr.message });
    }

    // Valideer verplichte velden
    var required = ['userId', 'date', 'day', 'session', 'clockIn', 'clockOut', 'duration', 'month'];
    for (var i = 0; i < required.length; i++) {
      if (payload[required[i]] === undefined || payload[required[i]] === null) {
        return jsonResponse({ success: false, error: 'Verplicht veld ontbreekt: ' + required[i] });
      }
    }

    // Bepaal de tabnaam van deze gebruiker (bv. "emile.meertens")
    var userTab = userTabNaam_(payload.userId);
    if (!userTab) {
      return jsonResponse({ success: false, error: 'Ongeldige userId.' });
    }

    // --- 2. Open spreadsheet (centraal bepaald via Script Property SPREADSHEET_ID) ---
    var ss = getSpreadsheet(null);
    if (!ss) {
      return jsonResponse({
        success: false,
        error:   'Spreadsheet niet gevonden. Stel de Script Property SPREADSHEET_ID in (zie setSpreadsheetId()).'
      });
    }

    // --- 3. Verkreeg lock om race conditions te vermijden ---
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000); // max 15 seconden wachten
    } catch (lockErr) {
      return jsonResponse({ success: false, error: 'Kon geen schrijflock verkrijgen. Probeer opnieuw.' });
    }

    try {
      // --- 4. Zorg dat het tabblad van DEZE gebruiker bestaat ---
      var sessiesSheet = getOrCreateSheet(ss, userTab, HEADERS_SESSIES);

      // --- 5. DEDUP-check: bestaat datum + sessie# al in dit tabblad? ---
      var alleRijen = sessiesSheet.getDataRange().getValues();
      // alleRijen[0] = headers, rest = data
      for (var r = 1; r < alleRijen.length; r++) {
        var rDatum   = alleRijen[r][0]; // kolom A: Datum
        var rSessie  = alleRijen[r][2]; // kolom C: Sessie #
        // Vergelijk als strings om type-issues te vermijden
        if (normalizeDatum_(rDatum) === String(payload.date).trim() && Number(rSessie) === Number(payload.session)) {
          // Duplicaat gevonden — niet opnieuw toevoegen
          return jsonResponse({ success: true, duplicate: true });
        }
      }

      // --- 6. Voeg nieuwe sessierij toe (Dagtotaal kolom G nog leeg) ---
      sessiesSheet.appendRow([
        payload.date,        // A: Datum
        payload.day,         // B: Dag
        payload.session,     // C: Sessie #
        payload.clockIn,     // D: Inkloktijd
        payload.clockOut,    // E: Uitkloktijd
        payload.duration,    // F: Duur sessie
        '',                  // G: Dagtotaal — wordt hieronder berekend en ingevuld
        payload.note || ''   // H: Werk — waar er tijdens deze shift aan gewerkt is
      ]);

      // --- 7. Herbereken en update Dagtotaal in de eerste-sessie-rij ---
      updateDagtotaal(sessiesSheet, payload.date);

      // --- 8. Update gecombineerd maandoverzicht voor deze gebruiker ---
      updateMonthSummary(ss, payload.month, userTab);

    } finally {
      lock.releaseLock();
    }

    return jsonResponse({ success: true });

  } catch (err) {
    // Vang onverwachte fouten op
    return jsonResponse({ success: false, error: 'Onverwachte fout: ' + err.message });
  }
}

// ============================================================
// DAGTOTAAL BEREKENING
// ============================================================

/**
 * Herberekent het dagtotaal voor een gegeven datum:
 * - Somt kolom F (Duur sessie) op voor alle rijen met die datum
 * - Schrijft het totaal in kolom G (Dagtotaal) van de rij met Sessie# 1
 * - Wist kolom G van alle overige rijen voor die datum
 *
 * @param {Sheet}  sheet  De "Sessies" sheet
 * @param {string} datum  Datum in dd/mm/yyyy formaat
 */
function updateDagtotaal(sheet, datum) {
  var data = sheet.getDataRange().getValues();
  // data[0] = headers
  var eersteRijIndex = -1;  // 0-gebaseerde index in data (inclusief header)
  var totaalDuur     = 0;

  var doelDatum = String(datum).trim();
  for (var r = 1; r < data.length; r++) {
    if (normalizeDatum_(data[r][0]) === doelDatum) {
      totaalDuur += Number(data[r][5]) || 0; // kolom F (index 5)
      // Wis bestaand dagtotaal in deze rij (wordt hieronder correct ingevuld)
      sheet.getRange(r + 1, 7).setValue(''); // +1 omdat Sheets 1-gebaseerd is
      if (Number(data[r][2]) === 1) {
        eersteRijIndex = r + 1; // 1-gebaseerde rijnummer voor Sheets
      }
    }
  }

  // Schrijf het totaal in de eerste-sessie-rij
  if (eersteRijIndex > 0) {
    sheet.getRange(eersteRijIndex, 7).setValue(Math.round(totaalDuur * 100) / 100);
  }
}

// ============================================================
// MAANDOVERZICHT
// ============================================================

/**
 * Berekent het maandoverzicht voor ÉÉN gebruiker (vanuit diens tabblad) en
 * schrijft/overschrijft de bijbehorende rij in het gedeelde "Maandoverzicht".
 * Elke rij wordt geïdentificeerd door (maand + naam).
 *
 * @param {Spreadsheet} ss          De spreadsheet
 * @param {string}      monthLabel  Bv. "Juni 2026"
 * @param {string}      userTab     Tabnaam/naam van de gebruiker, bv. "emile.meertens"
 */
function updateMonthSummary(ss, monthLabel, userTab) {
  var sessiesSheet = ss.getSheetByName(userTab);
  if (!sessiesSheet) return; // veiligheidscheck

  var maandSheet = getOrCreateSheet(ss, SHEET_MAAND, HEADERS_MAAND);
  // Defensief: forceer kolom A (Maand) naar tekst zodat labels niet naar een
  // Date gecoerceerd worden.
  maandSheet.getRange('A:A').setNumberFormat('@');

  // Parseer maandlabel → jaar en maandnummer voor filtering
  var maandInfo = parseMaandLabel(monthLabel);
  if (!maandInfo) return; // onbekend formaat, sla over

  // Haal alle sessiedata van DEZE gebruiker op
  var sessiesData = sessiesSheet.getDataRange().getValues();

  // Verzamel unieke datums en som van dagtotalen voor deze maand
  var uniekeDatums  = {};  // datum-string → dagtotaal (G-kolom waarde)

  for (var r = 1; r < sessiesData.length; r++) {
    var rij       = sessiesData[r];
    var rDatum    = normalizeDatum_(rij[0]);   // dd/mm/yyyy (robuust voor Date-cellen)
    var rSessie   = Number(rij[2]);   // Sessie #
    var rDagtot   = rij[6];          // Dagtotaal (alleen gevuld bij sessie 1)

    // Controleer of deze rij bij de gevraagde maand hoort
    if (!datumHoortBijMaand(rDatum, maandInfo.jaar, maandInfo.maandNummer)) continue;

    if (!uniekeDatums.hasOwnProperty(rDatum)) {
      uniekeDatums[rDatum] = 0;
    }

    // Tel dagtotaal op via kolom G van sessie-1-rijen
    if (rSessie === 1 && rDagtot !== '' && rDagtot !== null && rDagtot !== undefined) {
      uniekeDatums[rDatum] = Number(rDagtot) || 0;
    }
  }

  // Bereken aggregaten
  var werkdagen    = Object.keys(uniekeDatums).length;
  var totaleUren   = 0;
  for (var d in uniekeDatums) {
    totaleUren += uniekeDatums[d];
  }
  totaleUren       = Math.round(totaleUren * 100) / 100;
  var gemiddelde   = werkdagen > 0 ? Math.round((totaleUren / werkdagen) * 100) / 100 : 0;

  // Normaliseer het label zodat de weergave altijd consistent is ("Juni 2026")
  var canonLabel = canonMaandLabel_(monthLabel);
  var maandKey   = canonLabel.toLowerCase();
  var naamKey    = String(userTab).toLowerCase();

  // Zoek ALLE rijen die bij (deze maand + deze naam) horen. Meerdere matches =
  // bestaande duplicaten die we meteen opruimen (zelfhelend).
  var maandData  = maandSheet.getDataRange().getValues();
  var matches    = []; // 1-gebaseerde rijnummers
  for (var m = 1; m < maandData.length; m++) {
    var rMaand = canonMaandLabel_(maandData[m][0]).toLowerCase();
    var rNaam  = String(maandData[m][1]).trim().toLowerCase();
    if (rMaand === maandKey && rNaam === naamKey) {
      matches.push(m + 1);
    }
  }

  var nieuweRij = [canonLabel, userTab, werkdagen, totaleUren, gemiddelde];

  if (werkdagen === 0) {
    // Geen sessies meer voor deze maand → verwijder eventuele bestaande rijen
    for (var z = matches.length - 1; z >= 0; z--) {
      maandSheet.deleteRow(matches[z]);
    }
  } else if (matches.length === 0) {
    // Nieuwe (maand + naam) → toevoegen
    maandSheet.appendRow(nieuweRij);
  } else {
    // Overschrijf de eerste match; verwijder eventuele extra duplicaten
    maandSheet.getRange(matches[0], 1, 1, 5).setValues([nieuweRij]);
    for (var k = matches.length - 1; k >= 1; k--) {
      maandSheet.deleteRow(matches[k]);
    }
  }

  // Sorteer Maandoverzicht: chronologisch op maand, daarna alfabetisch op naam
  sorteerMaandoverzicht(maandSheet);
}

// ============================================================
// SORTEER MAANDOVERZICHT
// ============================================================

/**
 * Sorteert de datarows van "Maandoverzicht" chronologisch op maand+jaar.
 * Headers (rij 1) blijven op hun plek.
 *
 * @param {Sheet} maandSheet  De "Maandoverzicht" sheet
 */
function sorteerMaandoverzicht(maandSheet) {
  var data = maandSheet.getDataRange().getValues();
  if (data.length < 2) return; // alleen header: niets te doen

  var headers  = data[0];
  var dataRows = data.slice(1);

  // Normaliseer elk label naar een nette tekststring ("Juni 2026"). Dit zet
  // ook eventuele door Sheets ge-coercede Date-cellen om naar tekst, zodat de
  // hele kolom A voortaan consistent en vergelijkbaar is.
  for (var i = 0; i < dataRows.length; i++) {
    dataRows[i][0] = canonMaandLabel_(dataRows[i][0]);
  }

  // Sorteer chronologisch op maand; bij gelijke maand alfabetisch op naam (kolom B)
  dataRows.sort(function(a, b) {
    var ms = maandLabelNaarSorteersleutel(a[0]) - maandLabelNaarSorteersleutel(b[0]);
    if (ms !== 0) return ms;
    return String(a[1]).toLowerCase() < String(b[1]).toLowerCase() ? -1 :
           String(a[1]).toLowerCase() > String(b[1]).toLowerCase() ?  1 : 0;
  });

  // Schrijf gesorteerde data terug (headers + gesorteerde rijen)
  var alleData = [headers].concat(dataRows);
  maandSheet.getRange(1, 1, alleData.length, alleData[0].length).setValues(alleData);
}

/**
 * Converteert een maandlabel ("Juni 2026") naar een numerieke sorteersleutel
 * (bv. 202606) voor chronologische sortering.
 *
 * @param  {string} label  Maandlabel in "Maandnaam JJJJ" formaat
 * @return {number}        Numerieke sleutel (JJJJMM), of 999999 bij onbekend formaat
 */
function maandLabelNaarSorteersleutel(label) {
  var parts = canonMaandLabel_(label).split(' ');
  if (parts.length < 2) return 999999;
  var maandNaam = parts[0]; // al genormaliseerd naar Hoofdletter-eerst
  var jaar      = parseInt(parts[1], 10);
  var maandNr   = MAAND_NUMMERS[maandNaam];
  if (!maandNr || isNaN(jaar)) return 999999;
  return jaar * 100 + maandNr;
}

// ============================================================
// HULPFUNCTIES
// ============================================================

/**
 * Normaliseert een datum-celwaarde naar een "dd/mm/yyyy" string.
 *
 * ROBUUST: Google Sheets coerceert in een EU-locale een ingevoerde
 * "25/06/2026" automatisch naar een Date-object. getValues() geeft dan
 * een Date terug i.p.v. de string, waardoor naïeve string-vergelijkingen
 * falen. Deze helper maakt de vergelijking type-onafhankelijk: of de cel
 * nu een Date of een string is, je krijgt altijd hetzelfde "dd/mm/yyyy".
 *
 * @param  {*}      value  Celwaarde (Date of string)
 * @return {string}        dd/mm/yyyy
 */
function normalizeDatum_(value) {
  if (value instanceof Date) {
    var tz = Session.getScriptTimeZone() || 'Europe/Brussels';
    return Utilities.formatDate(value, tz, 'dd/MM/yyyy');
  }
  return String(value).trim();
}

/**
 * Normaliseert een maandlabel naar één vaste vorm: "Juni 2026".
 * Maakt de maandnaam Hoofdletter-eerst (rest klein) en trimt spaties,
 * zodat "juni 2026", "JUNI 2026" en "Juni  2026" allemaal gelijk worden.
 *
 * @param  {*}      label
 * @return {string}
 */
function canonMaandLabel_(label) {
  // ROBUUST: Google Sheets coerceert "Juni 2026" in een NL-locale automatisch
  // naar een Date (1 juni 2026). getValues() geeft dan een Date terug i.p.v.
  // de string. Vang dat op en bouw het label opnieuw uit de maand + het jaar.
  if (label instanceof Date) {
    var namen = ['Januari','Februari','Maart','April','Mei','Juni',
                 'Juli','Augustus','September','Oktober','November','December'];
    return namen[label.getMonth()] + ' ' + label.getFullYear();
  }
  var parts = String(label).trim().split(/\s+/);
  if (parts.length < 2) return String(label).trim();
  var naam = parts[0].toLowerCase();
  naam = naam.charAt(0).toUpperCase() + naam.slice(1);
  return naam + ' ' + parts[1];
}

/**
 * Leidt een maandlabel ("Juni 2026") af uit een datum "dd/mm/yyyy".
 *
 * @param  {string} datum  dd/mm/yyyy
 * @return {string}        bv. "Juni 2026", of '' bij ongeldig formaat
 */
function maandLabelUitDatum_(datum) {
  var delen = String(datum).split('/');
  if (delen.length !== 3) return '';
  var mnd = parseInt(delen[1], 10);
  var jaar = parseInt(delen[2], 10);
  if (isNaN(mnd) || isNaN(jaar) || mnd < 1 || mnd > 12) return '';
  var namen = ['Januari','Februari','Maart','April','Mei','Juni',
               'Juli','Augustus','September','Oktober','November','December'];
  return namen[mnd - 1] + ' ' + jaar;
}

/**
 * Zet een userId ("emile.meertens") om naar een geldige, veilige tabnaam.
 * Google Sheets staat niet toe: [ ] * ? / \ : en namen > 100 tekens.
 *
 * @param  {*}             userId
 * @return {string|null}   geldige tabnaam, of null als ongeldig/gereserveerd
 */
function userTabNaam_(userId) {
  var naam = String(userId || '').trim().toLowerCase();
  if (!naam) return null;
  // Vervang verboden tekens door '-'
  naam = naam.replace(/[\[\]\*\?\/\\:]/g, '-');
  // Verwijder leidende/sluitende apostrof (niet toegestaan door Sheets)
  naam = naam.replace(/^'+|'+$/g, '');
  naam = naam.substring(0, 90);
  if (!naam) return null;
  if (GERESERVEERDE_TABS[naam]) return null; // botst met "maandoverzicht"
  return naam;
}

/**
 * Opent de spreadsheet via PropertiesService of als fallback via getActiveSpreadsheet.
 *
 * @return {Spreadsheet|null}
 */
function getSpreadsheet(payloadId) {
  // Prioriteit: 1) ID meegestuurd vanuit de app, 2) Script Property, 3) actieve sheet
  var id = payloadId || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // ID is ingesteld maar ongeldig of geen toegang
      return null;
    }
  }
  // Fallback: probeer de actieve spreadsheet (alleen beschikbaar als het script
  // gekoppeld is aan een spreadsheet, niet als standalone script)
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {
    // getActiveSpreadsheet gooit een fout in een standalone Web App zonder actieve sheet
  }
  return null;
}

/**
 * Geeft een bestaande sheet terug, of maakt hem aan met de opgegeven headers.
 *
 * @param  {Spreadsheet} ss       De spreadsheet
 * @param  {string}      naam     Naam van de tab
 * @param  {Array}       headers  Array met kolomkoppen
 * @return {Sheet}
 */
function getOrCreateSheet(ss, naam, headers) {
  var sheet = ss.getSheetByName(naam);
  if (!sheet) {
    sheet = ss.insertSheet(naam);
    sheet.appendRow(headers);
    // Bevriest de headerrij zodat die zichtbaar blijft bij scrollen
    sheet.setFrozenRows(1);
    // KRITIEK: forceer kolom A naar platte tekst ('@').
    // Anders coerceert Sheets in een NL/EU-locale de waarde automatisch naar
    // een Date: "25/06/2026" (Sessies) of "Juni 2026" → 1 juni 2026 (Maand).
    // Dan falen alle string-vergelijkingen op kolom A (dedup, dagtotaal,
    // maandoverzicht). Tekstformaat houdt het een string. Geldt voor beide tabs.
    sheet.getRange('A:A').setNumberFormat('@');
  }
  return sheet;
}

/**
 * Parseert een maandlabel ("Juni 2026") naar {maandNummer, jaar}.
 *
 * @param  {string}      label
 * @return {{maandNummer:number, jaar:number}|null}
 */
function parseMaandLabel(label) {
  if (!label) return null;
  // Normaliseer naar "Juni 2026" zodat een lowercase label ("juni 2026")
  // ook gevonden wordt in MAAND_NUMMERS (die alleen Hoofdletter-sleutels heeft).
  var parts = canonMaandLabel_(label).split(' ');
  if (parts.length < 2) return null;
  var maandNr = MAAND_NUMMERS[parts[0]];
  var jaar    = parseInt(parts[1], 10);
  if (!maandNr || isNaN(jaar)) return null;
  return { maandNummer: maandNr, jaar: jaar };
}

/**
 * Controleert of een datum (dd/mm/yyyy) bij het opgegeven jaar en maandnummer hoort.
 *
 * @param  {string}  datum        dd/mm/yyyy
 * @param  {number}  jaar
 * @param  {number}  maandNummer  1-gebaseerd
 * @return {boolean}
 */
function datumHoortBijMaand(datum, jaar, maandNummer) {
  // Verwacht formaat: dd/mm/yyyy
  var delen = datum.split('/');
  if (delen.length !== 3) return false;
  var dMaand = parseInt(delen[1], 10);
  var dJaar  = parseInt(delen[2], 10);
  return dMaand === maandNummer && dJaar === jaar;
}

/**
 * Hulpfunctie om JSON-responses te genereren.
 *
 * @param  {Object} obj  Het te serialiseren object
 * @return {TextOutput}
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
