# GrooveShelf – Requirements und Entwicklungsplan

Stand: 3. Oktober 2026. Quelle: `Anforderungen-Vinyl-Archiv.md`.

Dieses Dokument beschreibt den gewünschten Funktionsumfang. Es bestätigt keine Implementierung. Alle Einträge sind offen. IDs bleiben bei einer späteren Übernahme als GitHub-Issues erhalten. Die beantwortete Originaldatei bleibt die maßgebliche Quelle für Nutzerwünsche.

## Projektname

Die Anwendung heißt **GrooveShelf**. Vorgeschlagener GitHub-Repository-Name: `grooveshelf`. Es existiert noch kein Repository; die Namensverfügbarkeit ist ungeprüft.

## Produktziel

Eine private, selbst betriebene Webanwendung archiviert physische Vinyl-Exemplare, liefert Albuminformationen und unterstützt später NFC-basierte Hörhistorie. Ausgangsgröße: ungefähr 300 Exemplare, monatlich etwa drei weitere. Nutzung im Haushalt auf Mac, Smartphone und Tablet. Gestaltung: minimal, modern, ruhig; mobile first.

## Verbindliche technische Rahmenbedingungen

- Open-Source-Projekt auf GitHub; MIT-Lizenz bestätigt.
- Backend in Python mit FastAPI; getrenntes Frontend.
- Erweiterbare Schnittstellen für Metadatenquellen, Importe und Exporte.
- Betrieb auf Raspberry Pi 5 mit Docker und Docker Compose; ARM64-Unterstützung erforderlich.
- Persistente Daten und lokal gespeicherte Cover müssen Container-Neustarts und Updates überstehen.
- Möglichst geringer Wartungsaufwand und keine obligatorischen laufenden Kosten.
- Erste Version für das private Heimnetz, ohne Benutzerkonten. Öffentliche Bereitstellung ist kein Bestandteil der ersten Version.
- Keine Offline-Funktion erforderlich. Eine gemeinsame serverseitige Sammlung wird von allen Geräten verwendet.
- Frontend-Technik und Datenbank sind noch zu entscheiden. „Docker Stack“ wird vorläufig als Compose-Betrieb verstanden; Docker Swarm ist noch nicht vereinbart.

## Datenmodell – fachliche Vorgaben

Ein Album ist von einem physischen Exemplar zu unterscheiden. Mehrere Exemplare können zum selben Album gehören. Exakte Veröffentlichungen beziehungsweise Pressungen sind optional und später ausbaubar. Ein Doppelalbum erhält eine Inventarnummer für das gesamte Set. Für Boxsets wird vorläufig ebenfalls eine Nummer pro Set angenommen.

Jedes Exemplar besitzt eine interne, unveränderliche ID und eine manuell eingegebene, eindeutige Inventarnummer im Format `LP-00001` bis `LP-99999`. Die Inventarnummer darf geändert und nach Löschung wiederverwendet werden. NFC-Zuordnungen sollen deshalb auf der internen ID beruhen. Andere Vinyl-Formate einschließlich Singles und EPs werden unterstützt.

## Meilenstein M1 – erste benutzbare Version

Die ausdrücklich genannten Kernfunktionen sind Hinzufügen, Details und Übersicht. Automatische Datenbeschaffung gehört zum grundlegenden Produktwunsch; ihr Umfang und die Verfügbarkeit einzelner Felder hängen von der Quelle ab.

| ID | Feature / Issue | Abnahmekriterien |
| --- | --- | --- |
| CORE-01 | Physisches Exemplar anlegen und bearbeiten | Manuelle Inventarnummer; Format und Eindeutigkeit geprüft; Künstler, Albumtitel und Format erfassbar; mehrere Exemplare desselben Albums möglich. |
| CORE-02 | Exemplar löschen und Nummer ändern | Änderungen und Löschung sind möglich; eine freigewordene Nummer kann erneut vergeben werden; andere Exemplare bleiben unverändert. |
| CORE-03 | Sammlung anzeigen | Umschaltbares Coverraster und Tabelle; beide öffnen dieselbe Detailansicht; auf Smartphone, Tablet und Mac bedienbar. |
| CORE-04 | Albumdetails anzeigen | Cover, Künstler, Albumname und Trackliste sofort sichtbar; fehlende Informationen verständlich dargestellt; Seitenpositionen wie A1/B1 angezeigt, soweit vorhanden. |
| META-01 | Discogs-Suche und Datenübernahme | Suche nach Künstler und Album; zunächst Master-orientierte Auswahl; Nutzer bestätigt einen Vorschlag vor Übernahme; falsche oder fehlende Treffer verhindern keine manuelle Erfassung. |
| META-02 | Basis-Metadaten und Cover speichern | Cover, Tracks, Jahr, Genre und weitere verfügbare Grundangaben übernehmen; Cover lokal speichern, soweit Quellenbedingungen dies erlauben; Quelle und Link anzeigen. |
| META-03 | Eigene Korrekturen schützen | Manuell bearbeitete Angaben werden bei erneuter Übernahme nicht still überschrieben. |
| OPS-01 | Getrennte Dienste und Compose-Betrieb | Frontend und FastAPI-Backend getrennt; dokumentierter Start auf Raspberry Pi 5; persistente Datenablage; Konfiguration ohne Änderung des Quellcodes. |
| OSS-01 | GitHub-Projekt und Nachverfolgung | Repository, README, Installationsanleitung und gewählte Open-Source-Lizenz vorhanden; Requirements mit Issues und Meilensteinen verknüpft. |

## Meilenstein M2 – NFC und Hörhistorie

| ID | Feature / Issue | Abnahmekriterien |
| --- | --- | --- |
| NFC-01 | PN532-Anbindung | Raspberry Pi liest NTAG213-Tags über PN532; unbekannte Tags können einem Exemplar zugeordnet werden; Verbindungsschnittstelle wird vor Umsetzung festgelegt. |
| NFC-02 | Tags ersetzen | Neuer Tag kann bestehendem Exemplar zugeordnet werden; Sammlung und Historie bleiben erhalten; alte Zuordnung wird entfernt. |
| NFC-03 | Scan öffnet Details | Scan führt zur Detailansicht des zugeordneten Exemplars auf dem Bildschirm am Raspberry Pi; die Browsersteuerung ist noch zu entscheiden. Ein dauerhaft geöffneter Browser im Kioskmodus ist ein Umsetzungsvorschlag. |
| PLAY-01 | Zeitversetzte Hörzählung | Ein gültiger Scan startet einen Zehn-Minuten-Vorgang; daraus entsteht höchstens ein Hörereignis pro Vorgang; Wiederholung, Abbruch und Neustartverhalten werden vor Umsetzung festgelegt. |
| PLAY-02 | Historie und Zähler | Hörereignisse, Anzahl und zuletzt gehört sichtbar; Zähler und Historie bleiben konsistent. |
| PLAY-03 | Lieblingsplatten | Lieblingsmarkierung setzen, entfernen und anzeigen. |

## Meilenstein M3 – Sammlung und Erfassung ausbauen

Diese Zuordnung ist ein Vorschlag für die Reihenfolge, keine zusätzliche Zurückstellung ausdrücklich gewünschter Funktionen.

| ID | Feature / Issue | Abnahmekriterien |
| --- | --- | --- |
| SEARCH-01 | Sammlung durchsuchen | Suche findet Künstler, Albumtitel und Tracktitel und führt zu den entsprechenden Exemplaren. |
| PERSONAL-01 | Persönliche Angaben | Zustand von Platte und Hülle, Notizen und Bewertung erfassen und bearbeiten; Bewertungsskala noch festzulegen. |
| WISH-01 | Wunschliste | Gewünschte Alben separat verwalten; Einträge müssen keine physische Inventarnummer besitzen. |
| CAPTURE-01 | Schnellerfassungsmodus | Mehrere Platten nacheinander mit wenigen wiederkehrenden Eingaben erfassen. |
| CAPTURE-02 | Dublettenhinweis | Bereits vorhandene passende Alben anzeigen; zusätzliches Exemplar weiterhin zulassen. |
| CAPTURE-03 | Barcode und Katalognummer | Identifikation über Barcode beziehungsweise Katalognummer; bei fehlendem Treffer manuelle Suche möglich. |
| CAPTURE-04 | Coverfoto zur Identifikation | Foto liefert bestätigbare Suchvorschläge; technische Machbarkeit und kostenfreie Quelle vorher prüfen. |
| IMPORT-01 | Discogs-Import | Sammlung importieren; Vorschau, wiederholte Importe und Zuordnung eigener LP-Nummern geregelt; vorhandene Daten nicht still überschreiben. API-Import oder CSV-Verfahren noch festzulegen. |
| EXPORT-01 | CSV-Export | Sammlung mit Inventarnummern und vereinbarten Feldern exportieren; Schnittstelle für weitere Exportformate vorsehen. |
| META-04 | Aktualisierung und Übernahmeoptionen | Automatische Aktualisierung ein- und ausschaltbar; manuelle Aktualisierung möglich; Bestätigung der Erstübernahme konfigurierbar; eigene Korrekturen geschützt. |
| META-05 | Konflikte und zusätzliche Quellen | Widersprüche sichtbar machen und Entscheidung anfordern; weitere Quellen über definierte Schnittstellen ergänzbar. |
| META-06 | Albumtexte und Zusatzinformationen | Beschreibungen, Rezensionen, Label und Mitwirkende übernehmen, soweit Quelle und Nutzungsbedingungen dies ermöglichen; fehlende Felder zulassen. |
| OPS-02 | Backup und Wiederherstellung | Datenbank, Cover und erforderliche Konfiguration sichern und wiederherstellen; Verfahren und Zielmedium noch festzulegen. Vor produktiver Nutzung erforderlich. |
| UI-01 | Sprache | Deutsche und englische Inhalte unterstützen; gewünschte Oberflächensprache und Übersetzungsumfang noch klären. |

## Spätere optionale Features

| ID | Feature |
| --- | --- |
| LATER-01 | Exakte Pressungen und getrennte Anzeige von Originaljahr und Pressungsjahr |
| LATER-02 | Tracklängen, Songwriter, Produzenten und weitere Mitwirkendendetails |
| LATER-03 | Eigene Fotos von Cover, Rückseite, Label und Matrixnummer |
| LATER-04 | Lagerorte |
| LATER-05 | QR-Codes als zusätzliche Kennzeichnung |
| LATER-06 | Geschätzte Marktwerte |
| LATER-07 | Stapelbearbeitung |
| LATER-08 | Links zu Streamingdiensten |
| LATER-09 | Anmeldung und mehrere Benutzerkonten |
| LATER-10 | Optionale kostenpflichtige Metadatenquellen |
| LATER-11 | Weitere Exportformate |
| LATER-12 | NFC-Tags beschreiben, falls für den gewählten Ablauf erforderlich |

Keine aktuelle Anforderung: Ausleihverwaltung, Abbildung der physischen Sortierreihenfolge, öffentliche Sammlung oder Verkaufsliste. Die Wunschliste ist dagegen gewünscht.

## Offene Entscheidungen

1. GitHub-Repository `grooveshelf` anlegen; MIT-Lizenz bestätigt. Projektname GrooveShelf ist bestätigt.
2. NFC: PN532-Verbindung (I²C, SPI oder UART), Browsersteuerung für die Detailansicht auf dem Pi-Bildschirm, Tag-UID oder beschriebener Inhalt.
3. Hörzählung: Verhalten bei wiederholtem Scan, Wechsel innerhalb zehn Minuten, Neustart und manueller Korrektur; Album- oder Exemplarbewertung und Zusammenfassung der Zähler.
4. Frontend und Datenbank anhand ARM64-Betrieb, Einfachheit und Erweiterbarkeit auswählen.
5. Discogs-Zugriff, Quellenbedingungen, Cover-Nutzung und tatsächliche Feldverfügbarkeit prüfen.
6. Discogs-Import: Verfahren, Nummernvergabe und Umgang mit bereits vorhandenen Exemplaren.
7. Backups: Ziel, Häufigkeit und Wiederherstellungsablauf.
8. Oberfläche: Deutsch als Standard? Bewertungsskala? Boxset-Modell bestätigen.
9. Reihenfolge von M2 und M3 gemeinsam priorisieren. Die erste produktive Version benötigt ein Backup-Verfahren unabhängig vom Meilenstein.

## Pflege in GitHub

Pro Requirement wird ein Issue mit der stabilen ID im Titel angelegt, zum Beispiel `[CORE-01] Physisches Exemplar anlegen und bearbeiten`. Issue-Inhalt: Ziel, Bezug zu den Antworten, Abnahmekriterien, Abhängigkeiten und offene Entscheidungen.

Vorgeschlagene Labels: `feature`, `backend`, `frontend`, `nfc`, `metadata`, `import-export`, `operations`, `needs-decision`. Status: Backlog → Bereit → In Arbeit → Review → Erledigt. Ein Issue gilt erst als erledigt, wenn seine Abnahmekriterien nachweislich erfüllt sind. Pull Requests referenzieren die zugehörigen Issues. GitHub-Issues wurden bislang nicht angelegt.
