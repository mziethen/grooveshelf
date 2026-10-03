# GrooveShelf

Ein ruhiges, mobiles Vinyl-Archiv für deine Sammlung — selbst betrieben auf einem Raspberry Pi 5.

## Projektstatus

GrooveShelf befindet sich in der Anforderungs- und Planungsphase. Es gibt noch keine lauffähige Anwendung.

## Geplante Funktionen

- Physische Vinyl-Exemplare mit eigener Inventarnummer `LP-00001` bis `LP-99999` verwalten.
- Sammlung als Coverraster oder Tabelle betrachten und Albumdetails öffnen.
- Metadaten und Cover über Discogs beziehen; eigene Korrekturen schützen.
- PN532 und NTAG213 zur NFC-Erkennung nutzen; Details auf dem Pi-Bildschirm anzeigen.
- Hörhistorie, Bewertungen, Wunschliste und Discogs-Import ergänzen.

## Technischer Rahmen

Python mit FastAPI im Backend, getrenntes Frontend und Betrieb per Docker Compose auf ARM64. Frontend und Datenbank werden noch ausgewählt. Die erste Version richtet sich an das private Heimnetz.

## Anforderungen und Fortschritt

- [Requirements und Meilensteine](Requirements-Vinyl-Archiv.md)
- [Beantworteter Anforderungskatalog](Anforderungen-Vinyl-Archiv.md)
- GitHub-Issues bilden die Requirements mit stabilen IDs ab.

## Mitarbeit

Bitte vor einer Implementierung das zugehörige Issue prüfen. Ein Feature ist abgeschlossen, wenn seine Abnahmekriterien erfüllt sind. Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

GrooveShelf steht unter der [MIT-Lizenz](LICENSE).
