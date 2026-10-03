# Anforderungen für das Vinyl-Archiv

Beantworte die Fragen direkt unter **Antwort:**. Du kannst Fragen überspringen oder „Weiß ich noch nicht“ eintragen. Für den Anfang sind die Fragen **1–15** am wichtigsten.

Die wichtigste Weiche: Möchtest du Alben katalogisieren oder deine konkreten Pressungen? Dasselbe Album kann in vielen Ausgaben mit unterschiedlichen Covern, Tracklisten und Werten existieren.

## Ziel und Nutzung

### 1. Was soll die Anwendung für dich hauptsächlich lösen: Überblick, schnelles Wiederfinden, Informationen entdecken, Sammlung bewerten oder etwas anderes?

**Antwort:**
- Überblick über meine Sammlung
- Informationen zu den Vinyls
- zählen wie oft ich die Vinyl gehört habe (NFC)
- Bewerten der Alben

### 2. Wie viele Platten hast du ungefähr, und wie viele kommen pro Monat dazu?

**Antwort:**
ca. 300 und pro Montat kommen ca. 3 dazu


### 3. Wer benutzt die Anwendung — nur du, dein Haushalt oder weitere Sammler?

**Antwort:**
- mein Haushalt benutzt sie mit, ich primär


### 4. Auf welchen Geräten möchtest du sie nutzen: Mac, Windows-PC, iPhone, Android oder Tablet?

**Antwort:**
- Die entwicklung soll mobile first sein, die App soll auf dem Mac sowie Mobile Gerät und Tablet laufen.



### 5. Wo wirst du neue Platten erfassen: am Schreibtisch, am Regal oder unterwegs?

**Antwort:**
eher am Schreibtisch


### 6. Möchtest du eine installierte Anwendung oder eine Website, die du im Browser öffnest?

**Antwort:**
webseite, die ich im browser öffnen kann


### 7. Muss sie ohne Internet funktionieren? Welche Funktionen wären dann wichtig?

**Antwort:**
nein, muss nicht ohne internet funktionieren


### 8. Soll die Sammlung zwischen mehreren Geräten synchronisiert werden?

**Antwort:**
da es ne web app ist braucht sie das nicht


### 9. Soll alles lokal bei dir bleiben, oder wäre Speicherung in einer Cloud in Ordnung?

**Antwort:**
ja gerne alles lokal bei mir, die app sollte auf einem rpi 5 laufen, am besten in docker containern als stack.


### 10. Gibt es eine Anwendung oder ein Design, das dir als Vorbild gefällt?

**Antwort:**
nicht direkt, ich mag es minimal, modern aber es soll schon Zen und ruhig sein


## Was genau archiviert wird

### 11. Steht `LP-XXXXX` für ein einzelnes physisches Exemplar oder für ein Album, das du möglicherweise mehrfach besitzt?

**Antwort:**
ja lp-xxxxx ist ein von mir generierter aufkleber auf der vinyl


### 12. Ist `XXXXX` immer eine fünfstellige Zahl, etwa `LP-00001`?

**Antwort:**
ja genau das ist das format LP-00001 - LP-99999


### 13. Hast du bereits Nummern vergeben? Falls ja: Wo sind die bisherigen Daten gespeichert?

**Antwort:**
nein hab ich noch nicht, bzw sie existieren nur als aufklber auf den vinyls


### 14. Soll das Programm die nächste freie Nummer automatisch vergeben?

**Antwort:**
Nein, die kann gerne per hand eingegeben werden


### 15. Wie wichtig ist dir die genaue Pressung — beispielsweise Land, Erscheinungsjahr, Label, Katalognummer und Matrixnummer?

**Antwort:**
mir nicht so wichtig, ich möchte die applikation gerne open source sein, den besitzern ist es evtl. wichtig welche genaue pressung die haben


### 16. Sammelst du auch Singles, EPs, Maxi-Singles, Schellackplatten oder andere Formate?

**Antwort:**
Ja ich sammle auch andere formate wie singles usw. Schellackplatten nicht


### 17. Bekommt ein Doppelalbum eine Nummer für das komplette Set oder eine Nummer pro Platte?

**Antwort:**
eine nummer fürs komplette set


### 18. Wie sollen Boxsets mit mehreren Alben behandelt werden?

**Antwort:**
keine Ahnung, evtl nur das box set als nummer


### 19. Möchtest du mehrere Exemplare desselben Albums getrennt erfassen können?

**Antwort:**
ja


### 20. Darf eine vergebene Nummer später geändert oder nach dem Löschen wiederverwendet werden?

**Antwort:**
ja


## NFC und physische Kennzeichnung

### 21. Was soll passieren, wenn du einen NFC-Tag scannst: Detailseite öffnen, einen Standort anzeigen, eine Aktion auslösen oder etwas anderes?

**Antwort:**
Es soll sich die detail seite öffnen und nach 10 min als gespielt und der counter um 1 hochgezählt werden


### 22. Mit welchem Gerät möchtest du die Tags lesen?

**Antwort:**
NFC tag reader am raspberry pi


### 23. Hast du schon NFC-Tags oder einen NFC-Reader? Falls ja: welche?

**Antwort:**
ja hab ich, als leser den pn532 als tags ntag213

### 24. Soll die Anwendung auch die NFC-Tags beschreiben?

**Antwort:**
da kenne ich mich nicht mit aus


### 25. Soll auf dem Tag die Inventarnummer, ein Link zur Platte oder eine andere Kennung stehen? Falls du das offenlassen möchtest: Welches Verhalten erwartest du?

**Antwort:**
ja so was


### 26. Wo befestigst du die Tags — auf der Außenhülle, einer Schutzhülle oder an anderer Stelle?

**Antwort:**
an der rückseiter des aufbewahrungshülle


### 27. Soll jede Platte zusätzlich einen lesbaren Aufkleber mit `LP-XXXXX` bekommen?

**Antwort:**
ja


### 28. Wäre ein QR-Code als zusätzliche Möglichkeit zum Öffnen sinnvoll?

**Antwort:**
später, vielleicht als zusätzliche option, erstmal nicht wichtig, aber im hinterkopf behalten


### 29. Soll ein Tag bei Verlust oder Defekt ersetzt werden können, ohne den Datensatz zu ändern?

**Antwort:**
ja


### 30. Muss der Scan auf einem beliebigen Smartphone funktionieren oder nur auf deinen eigenen Geräten?

**Antwort:**
nur auf meinen eigenen gerät, den rpi 5


## Erfassung und Informationen aus dem Internet

### 31. Wie möchtest du eine neue Platte identifizieren: Künstler und Titel eingeben, Barcode scannen, Cover fotografieren oder Katalognummer eingeben?

**Antwort:**
gerne alle möglichkeiten


### 32. Was soll die Anwendung machen, wenn mehrere passende Veröffentlichungen gefunden werden?

**Antwort:**
zuerst nur die master version nehmen


### 33. Möchtest du Vorschläge immer bestätigen, bevor Informationen übernommen werden?

**Antwort:**
ja fürs erste, gerne als option umschaltbar machen


### 34. Hast du bevorzugte Datenquellen oder bereits ein Konto bei einem Musik- beziehungsweise Sammlungsdienst?

**Antwort:**
discogs ist das naheliegenste, gerne auch import von discogs


### 35. Wären kostenpflichtige Datenquellen akzeptabel? Falls ja: bis zu welchem Budget?

**Antwort:**
fürs erste nicht, aber gerne später auch als option


### 36. Welche Informationen sollen automatisch gesucht werden: Cover, Tracks, Veröffentlichungsjahr, Genre, Label, Mitwirkende, Beschreibung, Rezensionen oder weitere?

**Antwort:**
die alle gerne


### 37. Möchtest du beim Album sowohl das ursprüngliche Erscheinungsjahr als auch das Jahr deiner Pressung sehen?

**Antwort:**
erstmal nicht, aber spätere option bzw. feature


### 38. Soll die Trackliste nach Plattenseiten gegliedert sein, etwa A1–A5 und B1–B4?

**Antwort:**
Wenn möglich ja


### 39. Sind Tracklängen, Songwriter, Produzenten und beteiligte Musiker wichtig?

**Antwort:**
als späteres feature


### 40. Soll die Anwendung Informationen später automatisch aktualisieren oder nur auf Knopfdruck?

**Antwort:**
gerne automatisch, aber auch hier als option auswählbar machen


### 41. Wie soll sie mit widersprüchlichen Angaben aus unterschiedlichen Quellen umgehen?

**Antwort:**
Nachfragen


### 42. Möchtest du bei übernommenen Informationen die Quelle und einen Link sehen?

**Antwort:**
ja


### 43. Sollen manuell korrigierte Daten bei späteren Aktualisierungen geschützt werden?

**Antwort:**
ja


### 44. Möchtest du eigene Fotos ergänzen können — etwa Vorderseite, Rückseite, Label und Matrixnummer?

**Antwort:**
als späteres feature


### 45. Soll das Cover lokal gespeichert werden, damit es auch offline verfügbar bleibt?

**Antwort:**
ja lokal speichern


## Deine persönlichen Sammlungsdaten

### 46. Welche eigenen Angaben brauchst du: Kaufdatum, Kaufpreis, Händler, Zustand der Platte, Zustand der Hülle, Notizen oder Bewertung?

**Antwort:**
- Zustand der Platte
- Zustand der Hülle
- Notizen
- Bewertung


### 47. Möchtest du Lagerorte erfassen, etwa „Wohnzimmer → Regal 2 → Fach 3“?

**Antwort:**
als späteres feature


### 48. Soll die Anwendung eine feste Sortierreihenfolge deiner physischen Sammlung abbilden?

**Antwort:**
nein


### 49. Sind Ausleihen wichtig — einschließlich Person, Datum und Rückgabe?

**Antwort:**
nein


### 50. Brauchst du eine Wunschliste oder eine Liste mit Platten, die du verkaufen möchtest?

**Antwort:**
ja, eine wunschliste ist super


### 51. Möchtest du Hörhistorie, „zuletzt gehört“ oder Lieblingsplatten speichern?

**Antwort:**
ja


### 52. Soll beim Erfassen auf mögliche Dubletten hingewiesen werden?

**Antwort:**
ja


### 53. Sind geschätzte Marktwerte interessant? Welchen Zweck hätten sie für dich?

**Antwort:**
nein, aber als späteres feature möglich


### 54. Welche persönlichen Angaben sollen bei einem Teilen der Sammlung verborgen bleiben?

**Antwort:**
keine


## Suchen, Stöbern und Bedienung

### 55. Nach welchen Feldern möchtest du suchen und filtern?

**Antwort:**
- Künstler
- Album
- Track


### 56. Wie möchtest du die Sammlung sehen: Coverraster, Tabelle, virtuelle Regale oder mehrere Ansichten?

**Antwort:**
- als Coverraster oder als Tabelle umschaltbar


### 57. Welche Informationen müssen auf einer Plattendetailseite sofort sichtbar sein?

**Antwort:**
- cover
- künstler
- name des albums
- tracks


### 58. Brauchst du Stapelbearbeitung, etwa um 30 Platten gleichzeitig einem Regal zuzuordnen?

**Antwort:**
nein, aber als späteres feature möglich


### 59. Soll es einen schnellen Erfassungsmodus für deine bestehende Sammlung geben?

**Antwort:**
ja


### 60. Möchtest du Verknüpfungen zu Streamingdiensten, um ein Album direkt anzuhören?

**Antwort:**
als späteres feature denkbar


### 61. Soll die Oberfläche Deutsch sein? In welcher Sprache möchtest du Albumtexte lesen?

**Antwort:**
deutsch oder englisch je nach dem was da ist


### 62. Gibt es Anforderungen an Schriftgröße, Kontrast oder Bedienung ohne Maus?

**Antwort:**
erstmal nicht


## Daten, Betrieb und Umfang

### 63. Gibt es bestehende Listen, Tabellen oder Exporte, die wir importieren müssen?

**Antwort:**
die liste von discogs wäre super, da viele nutzer das bereits nutzen


### 64. In welchen Formaten möchtest du deine Sammlung exportieren können — beispielsweise CSV, Excel, PDF oder JSON?

**Antwort:**
- erstmal nur csv, soll aber erwitert werden können


### 65. Wie sollen Backups funktionieren, und wo sollen sie liegen?

**Antwort:**
weiß ich noch nicht


### 66. Möchtest du die Anwendung selbst betreiben oder soll sie möglichst ohne technische Wartung funktionieren?

**Antwort:**
- ich betreibe die selbst auf einem raspberry pi aber möglichst wartungsfrei


### 67. Falls sie im Internet erreichbar ist: Brauchst du Anmeldung und mehrere Benutzerkonten?

**Antwort:**
- erstmal nicht als späteres feature möglich


### 68. Soll deine Sammlung vollständig privat bleiben oder teilweise öffentlich teilbar sein?

**Antwort:**
erstmal nur privat


### 69. Gibt es ein Budget für Entwicklung und laufende Kosten?

**Antwort:**
soll ein open source projekt werden am besten keine laufenden kosten


### 70. Welche drei Funktionen müssen in der ersten Version unbedingt funktionieren?

**Antwort:**
- vinyl hinzufügen
- details sehen
- übersicht der sammlung


### 71. Welche Funktionen können später kommen?

**Antwort:**
meistens im text schon beantwortet


### 72. Woran würdest du nach einem Monat merken: „Diese Anwendung macht meine Sammlung wirklich einfacher“?

**Antwort:**
das stellt sich noch raus

## Weitere Wünsche und Anmerkungen

**Antwort:**
- ich möchte das ganze auf github bereit stellen als open source project
- können wir eine liste von requirements erstellen und die als issues und features in guthub pflegen, so dass der entwicklungsstand nachverfolgt werden kann
- docker als container benutzen gerne auch docker compose
- backend und frontend trennen
- als backend gerne python und fast api benutzen und alles auf erweiterbarkeit entwickeln
- frontend hab ich keine Ahnung, das was am besten geeignet ist
- geeignete datenbanken dürfen gerne benutzt werden
- gerne allse als docker stack laufähig machen
