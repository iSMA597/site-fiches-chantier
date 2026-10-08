# Appli Fiches chantier V2 (en construction)

Construite lot par lot selon `docs/PLAN_REALISATION_V2.md`, à partir des maquettes validées le 08/10/2026.
La v1.3 (`../app/`) reste en service jusqu'à la bascule (lot G).

Organisation prévue : un petit fichier par écran ou par sujet, avec des noms clairs.
- `js/donnees/` : connexion serveur, boîte d'envoi hors réseau (reprise de `../app/js/cloud.js`)
- `js/fiche/` : assistant en 8 étapes (lot B)
- `js/reseau/` : reçues, validation, corrections, rappels (lot C)
- `js/tableau-de-bord/` : lot D
- `js/registre/` : chantiers, plans, personnes, comptes (lot E)
- `js/excel/` : reprise de `../app/js/fiche-xlsx.js`
