/*
 * Appli V2 : barre d'onglets en bas (maquette validée). Patron et conducteur : Incorporation, Tableau de bord, Registre.
 * Les autres profils n'ont que « Incorporation » : pas de barre.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};

  var ICONES = {
    inc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 4h6M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="m9 13 2 2 4-4"/></svg>',
    tdb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    reg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h10"/></svg>'
  };
  var NOMS = { inc: 'Incorporation', tdb: 'Tableau de bord', reg: 'Registre' };

  function zones() {
    var r = ES.etat.profil && ES.etat.profil.role;
    return r === 'admin' || r === 'conducteur' ? ['inc', 'tdb', 'reg'] : ['inc'];
  }
  function barre(active) {
    var liste = zones();
    if (liste.length < 2) return '';
    var badge = ES.accueil.badge();
    return '<nav class="tabs" aria-label="Onglets">' + liste.map(function (z) {
      return '<button data-a="zone" data-v="' + z + '"' + (z === active ? ' aria-current="page"' : '') + '>' + ICONES[z] + NOMS[z] +
        (z === 'inc' && badge ? '<span class="badge badge--onglet" aria-label="' + badge + ' nouvelle(s)">' + badge + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
  }

  var ACTIONS = {
    'zone': async function (v) {
      if (zones().indexOf(v) < 0) return;
      if (v === 'inc') { ES.etat.ecran = { n: 'accueil' }; await ES.app.rafraichirListe(); }
      else if (v === 'tdb') await ES.tableau.ouvrir();
      else if (v === 'reg' && ES.registre) await ES.registre.ouvrir();
    }
  };

  ES.onglets = { barre: barre, zones: zones, ACTIONS: ACTIONS };
})(window);
