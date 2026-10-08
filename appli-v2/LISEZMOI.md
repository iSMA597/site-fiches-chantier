# Appli Fiches chantier V2

Construite lot par lot selon `docs/PLAN_REALISATION_V2.md`, à partir des maquettes validées le 08/10/2026.
La v1.3 (`../app/`) reste en service jusqu'à la bascule (lot G, après le pilote).

Un petit fichier par écran ou par sujet, avec des noms clairs. Scripts classiques chargés dans l'ordre de `index.html`,
espace de noms `window.ES`, boutons `data-a` / `data-v` (actions cherchées par `js/app.js`).

- `js/config.js` : serveur choisi selon l'adresse (local, test `/appli-v2-test/`, production) ; clés **publiques** seulement
- `js/donnees/serveur.js` : connexion au serveur, boîte d'envoi hors réseau, appels aux fonctions serveur
- `js/commun/outils.js` : texte échappé, dates, niveaux, messages
- `js/fiche/` : assistant en 8 étapes, brouillon, photos, signature (lot B)
- `js/reseau/` : réception, validation signée, renvoi à corriger, programmations et rappels, notifications (lot C)
- `js/tableau-de-bord/` : tableau de bord et export Excel (lot D)
- `js/registre/` : chantiers, structure, plans, personnes et codes, import Alobees, import de structure (lot E)
- `js/ecrans/` : connexion (code à 6 chiffres, Face ID), accueil, onglets
- `js/excel/` : Excel identique à la fiche papier
- `js/vendor/` : bibliothèques tierces (avec leur licence) : ExcelJS, supabase-js, idb-keyval, qrcode-generator, pdf.js 4
- `sw.js` : hors ligne (réseau d'abord), notifications ; changer `VERSION` à chaque mise à jour

Le stockage du téléphone utilise le préfixe `es2_` : la v1 (même site) n'est jamais touchée.
