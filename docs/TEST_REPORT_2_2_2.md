# Rapporto dei test locali — patch 2.2.2

## Superati nel contesto locale

- `python tools/build_frontend.py`: bundle riproducibile dai sei moduli.
- `python tests/check_frontend.py`: sintassi JavaScript, 336 ID HTML senza duplicati, CSV, famiglie di domande, assenza di QR, presenza del SQL 2.2.1 archiviato.
- `node tests/k9_regressions.mjs`: salvataggio di una domanda facile, duplicati oltre la pagina corrente, divieto di creare Vice con ruolo delegato, escape credenziali.
- Transpilazione TypeScript di `manage-exam-access/index.ts`: nessun diagnostico sintattico.
- Test browser isolato con Chromium/Playwright della banca: larghezze 320, 390, 430, 720 e 1024 px. Pulsante Modifica apre editor in zona visibile; Salva su domanda facile restituisce completamento nel mock; nessun overflow orizzontale; Mostra tutto nascosto per testo breve.
- Test browser isolato su archivio: larghezze 320, 390, 720 e 1024 px; nessun overflow orizzontale, tabella tradizionale su desktop.

## Non verificabili in un test isolato

- Operazioni Supabase reali con tutti e cinque i ruoli, inclusa revoca e riattivazione dell'accesso.
- Esecuzione concreta della funzione Edge e degli eventuali workflow di deploy.
- Persistenza e concorrenza del database attivo.
- Generazione reale e impaginazione A4 dei PDF e corrispondenza dei byte archiviati.
- Revisione scientifica delle banche e corrispondenza ai PDF didattici.

**Nota:** test locali superati non significano che il sistema sia già collaudato in produzione.
