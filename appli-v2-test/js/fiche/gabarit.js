/*
 * Appli V2 : contenu de la fiche (gabarit 2), lu dans modele/contenu.json.
 * contenu.json est généré depuis outils/fiche_gabarit.py (source de vérité, inchangée).
 * La fiche V2 garde les sections 1 à 3 sans lignes libres (27 points) ; les cadres « Photos Alobees »
 * et « Validation » de la fiche papier sont remplacés (CONCEPTION_V2 § 10, décision 9).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};

  var TITRES_ETAPES = { 1: 'Documents', 2: 'Matériel', 3: 'Contrôles' };   // sections 1-3 -> étapes 4-6
  // V2 : plus de lignes libres ; un matériel manquant se signale en anomalie avec une note (maquette validée le 08/10)
  var GUIDE_MATERIEL_V2 = 'Matériel manquant : le signaler en anomalie avec une note, ne pas improviser.';

  var contenu = null;

  function phraseNormale(titre) {
    var t = String(titre).toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  async function charger() {
    if (contenu) return contenu;
    var r = await fetch('modele/contenu.json');
    if (!r.ok) throw new Error('Contenu de la fiche introuvable (modele/contenu.json).');
    contenu = await r.json();
    return contenu;
  }

  // les 3 étapes de points : { etape, titre, long, alerte, points: [{ id, label }], guide }
  function sectionsV2() {
    return contenu.sections.filter(function (s) { return s.n <= 3; }).map(function (s) {
      var guide = contenu.guide[String(s.n)] || { faire: [], attention: [] };
      var attention = guide.attention.map(function (t) { return /lignes libres/i.test(t) ? GUIDE_MATERIEL_V2 : t; });
      return {
        etape: s.n + 3, titre: TITRES_ETAPES[s.n], long: phraseNormale(s.titre), alerte: s.alerte,
        points: s.items.filter(function (it) { return !it.libre; }).map(function (it) { return { id: it.id, label: it.label }; }),
        guide: { faire: guide.faire, attention: attention }
      };
    });
  }
  function tousLesPoints() {
    return sectionsV2().reduce(function (liste, s) { return liste.concat(s.points); }, []);
  }
  function rappels() { return contenu.rappels; }
  // photos Alobees toujours obligatoires : rappel affiché à l'étape 7
  function photosAlobees() {
    var s = contenu.sections.filter(function (x) { return x.n === 4; })[0];
    return s ? s.items.map(function (it) { return it.label; }) : [];
  }

  ES.gabarit = { charger: charger, sectionsV2: sectionsV2, tousLesPoints: tousLesPoints, rappels: rappels,
    photosAlobees: photosAlobees, contenu: function () { return contenu; } };
})(window);
