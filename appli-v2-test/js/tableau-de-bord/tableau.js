/*
 * Appli V2, lot D : tableau de bord (patron et conducteur), comme la maquette validée.
 *  - vue générale : chiffres clés, une carte par chantier (barre de couleurs, prochain coulage, alertes),
 *    fiches à contrôler, export Excel ;
 *  - vue d'un chantier : carte des logements en couleurs, points qui reviennent, fiches du chantier.
 * Les calculs sont faits par la base (vues v_tdb_chantiers et v_logements, migration 12).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  // couleur d'un logement : statut de la base -> [classe, libellé, repère]
  var COULEURS = {
    'VALIDÉ': ['vert', 'Validé', '✓'], 'À VALIDER': ['bleu', 'À valider', '•'], 'ANOMALIE': ['rouge', 'Anomalie', '!'],
    'EN COURS': ['jaune', 'En cours', '…'], 'À FAIRE': ['gris', 'À faire', '']
  };
  var ORDRE_BARRE = [['valides', 'vert'], ['a_valider', 'bleu'], ['anomalies', 'rouge'], ['en_cours', 'jaune']];

  function haut(titre, sousTitre, retour) {
    var p = ES.etat.profil;
    return '<div class="top">' + (retour ? '<button class="top__back" data-a="' + retour + '" aria-label="Retour">‹</button>'
      : '<img class="top__logo" src="icons/logo.png" alt="Euro Sanichauff">') +
      '<div class="top__t"><strong>' + h(titre) + '</strong><span>' + h(sousTitre) + '</span></div>' +
      '<button class="avatar" data-a="compte" aria-label="Mon compte : ' + h(p.nom) + '">' + o.initiales(p.nom) + '</button></div>';
  }
  function joursAvant(iso) {
    var jour = new Date(iso + 'T00:00:00'), auj = new Date(o.aujourdhui() + 'T00:00:00');
    return Math.round((jour - auj) / 864e5);
  }
  function pourcent(n, total) { return total ? Math.round(n / total * 100) : 0; }
  function ligne(f, chantier, lieu, detail) {
    var s = ES.reception.statut(f);
    return '<button class="row-btn" data-a="ouvrir" data-v="' + f.id + '"><div class="row-btn__main"><strong>' + h(chantier) + '</strong>' +
      '<span>' + h(lieu) + '</span><span>' + h(detail) + '</span>' +
      '<span class="pills"><span class="pill ' + s[1] + '">' + s[0] + '</span>' +
      (f.ko ? '<span class="pill p-ko">⚠ ' + o.pluriel(f.ko, 'anomalie') + '</span>' : '') + '</span></div><span class="chev" aria-hidden="true">›</span></button>';
  }
  function ligneFiche(f) {                        // une fiche de la vue v_fiches (noms déjà lisibles)
    return ligne(f, f.chantier, f.batiment + ' · ' + f.niveau + ' · ' + (f.logements || []).join(' '), 'coulage ' + o.frDate(f.coulage) + ' · ' + (f.auteur || ''));
  }
  function boiteMemoire(memoire) {
    if (!memoire || !memoire.length) return '<div class="lock">👍 Aucun point qui revient sur ce chantier</div>';
    return '<div class="warnbox"><b>⟲ Points qui reviennent sur ce chantier</b> <small>(rappelés la veille à l\'équipe)</small><ul>' +
      memoire.map(function (m) { return '<li>' + h(m.label) + ' <small>(' + m.fois + '×)</small></li>'; }).join('') + '</ul></div>';
  }

  // ------------------------------------------------------------ vue générale
  function carteChantier(c) {
    var pct = pourcent(c.valides, c.logements);
    var barre = ORDRE_BARRE.map(function (x) {
      return '<i class="c-' + x[1] + '" style="width:' + (c.logements ? c[x[0]] / c.logements * 100 : 0) + '%"></i>';
    }).join('');
    var coulage = '<b>à programmer</b>';
    if (c.prochain_coulage) {
      var j = joursAvant(c.prochain_coulage);
      coulage = '<b class="' + (j <= 2 ? 'txt-ko' : 'txt-navy') + '">' + o.frDate(c.prochain_coulage) + ' (J-' + j + ')</b>';
    }
    return '<button class="ch-card" data-a="tdb-chantier" data-v="' + c.chantier_id + '"><div class="ch-card__t"><span>' + h(c.chantier) + '</span><span>' + pct + ' %</span></div>' +
      '<div class="bar" aria-label="' + pct + ' % validés">' + barre + '</div>' +
      '<div class="ch-card__m"><span>Prochain coulage : ' + coulage + '</span>' +
      (c.fiches_anomalie ? '<span class="pill p-ko">⚠ ' + o.pluriel(c.fiches_anomalie, 'anomalie') + '</span>' : '') +
      (c.a_controler ? '<span class="pill p-envoyee">' + c.a_controler + ' à contrôler</span>' : '') +
      (c.points_memoire ? '<span class="pill p-oubli">⟲ ' + o.pluriel(c.points_memoire, 'point') + ' qui revien' + (c.points_memoire > 1 ? 'nent' : 't') + '</span>' : '') +
      '</div></button>';
  }
  function fichesAControler() {
    var monId = ES.etat.monId, admin = ES.etat.profil.role === 'admin';
    return (ES.etat.fiches || []).filter(function (f) {
      var c = ES.assistant.chantier(f.chantier_id);
      return ES.reception.aControler(f) && (admin || (c && c.conducteur_id === monId));
    });
  }
  function vue() {
    var liste = ES.etat.tdb || [];
    var total = 0, valides = 0, aControler = 0;
    liste.forEach(function (c) { total += c.logements; valides += c.valides; aControler += c.a_controler; });
    var out = '<div class="kpis"><div class="kpi"><b>' + liste.length + '</b><span>chantier' + (liste.length > 1 ? 's' : '') + '</span></div>' +
      '<div class="kpi"><b>' + total + '</b><span>logements</span></div>' +
      '<div class="kpi"><b>' + pourcent(valides, total) + ' %</b><span>validés</span></div>' +
      '<div class="kpi' + (aControler ? ' warn' : '') + '"><b>' + aControler + '</b><span>fiche' + (aControler > 1 ? 's' : '') + ' à contrôler</span></div></div>';
    out += '<div class="tdb-grid"><div>' + (liste.length ? liste.map(carteChantier).join('') : '<p class="empty">Aucun chantier.</p>') + '</div><div>';
    var aVoir = fichesAControler();
    out += '<h3>Fiches à contrôler</h3>' + (aVoir.length ? '<div class="list">' + aVoir.map(function (f) {
      var c = ES.assistant.chantier(f.chantier_id) || { nom: '' };
      return ligne(f, c.nom, ES.assistant.lieu(f), 'coulage ' + o.frDate(f.coulage) + (f.chef ? ' · chef ' + f.chef : ''));
    }).join('') + '</div>' : '<p class="empty">Aucune fiche à contrôler 👍</p>');
    out += '<button class="btn btn--ghost btn--block foot__row--marge" data-a="export-tdb">⬇ Exporter en Excel</button></div></div>';
    return { haut: haut('Tableau de bord', 'Incorporations avant coulage'), contenu: out, bas: ES.onglets.barre('tdb') };
  }

  // ------------------------------------------------------------ vue d'un chantier
  function legende() {
    return '<div class="legend">' + Object.keys(COULEURS).map(function (k) {
      return '<span><i class="sw c-' + COULEURS[k][0] + '"></i>' + COULEURS[k][1] + '</span>';
    }).join('') + '</div>';
  }
  function carteLogements(logements) {
    var batiments = [];
    logements.forEach(function (l) {
      var b = batiments.filter(function (x) { return x.id === l.batiment_id; })[0];
      if (!b) { b = { id: l.batiment_id, nom: l.batiment, niveaux: [] }; batiments.push(b); }
      var n = b.niveaux.filter(function (x) { return x.id === l.niveau_id; })[0];
      if (!n) { n = { id: l.niveau_id, nom: l.niveau, num: l.num, cases: [] }; b.niveaux.push(n); }
      n.cases.push(l);
    });
    return batiments.map(function (b) {
      return '<div class="bat"><h4>' + h(b.nom) + '</h4>' + b.niveaux.sort(function (x, y) { return y.num - x.num; }).map(function (n) {
        return '<div class="lvl"><span class="lvl__n">' + h(n.nom) + '</span><div class="lvl__c">' + n.cases.map(function (l) {
          var c = COULEURS[l.statut] || COULEURS['À FAIRE'];
          return '<button class="cell c-' + c[0] + '" data-a="logement" data-v="' + l.niveau_id + '|' + l.code + '" aria-label="' + l.code + ' : ' + c[1] + '">' +
            l.code + '<i aria-hidden="true">' + c[2] + '</i></button>';
        }).join('') + '</div></div>';
      }).join('') + '</div>';
    }).join('');
  }
  function vueChantier() {
    var d = ES.etat.tdbChantier;
    if (!d) return { haut: haut('Tableau de bord', '', 'zone-tdb'), contenu: '<p class="empty">Chargement…</p>', bas: ES.onglets.barre('tdb') };
    var c = (ES.etat.tdb || []).filter(function (x) { return x.chantier_id === d.id; })[0] || { chantier: '', valides: 0, logements: 0, a_controler: 0 };
    var out = '<div class="kpis"><div class="kpi"><b>' + c.valides + '/' + c.logements + '</b><span>logements validés</span></div>' +
      '<div class="kpi' + (c.a_controler ? ' warn' : '') + '"><b>' + c.a_controler + '</b><span>à contrôler</span></div></div>' +
      boiteMemoire(d.memoire) + legende() + carteLogements(d.logements) +
      '<h3>Fiches du chantier (' + d.fiches.length + ')</h3>' +
      (d.fiches.length ? '<div class="list">' + d.fiches.map(ligneFiche).join('') + '</div>' : '<p class="empty">Aucune fiche.</p>');
    return { haut: haut('Tableau de bord', c.chantier, 'zone-tdb'), contenu: out, bas: ES.onglets.barre('tdb') };
  }
  function feuilleLogement() {
    var f = ES.etat.feuille, d = ES.etat.tdbChantier;
    var l = d.logements.filter(function (x) { return x.niveau_id === f.niveau && x.code === f.code; })[0];
    var c = COULEURS[l.statut] || COULEURS['À FAIRE'];
    var fiches = d.fiches.filter(function (x) { return x.niveau_id === f.niveau && (x.logements || []).indexOf(f.code) >= 0; });
    return '<div class="sheet__h"><strong>Logement ' + h(l.code) + ' · ' + h(l.batiment) + ' ' + h(l.niveau) + '</strong>' +
      '<button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<p><span class="sw c-' + c[0] + '"></span> ' + c[1] + '</p>' +
      (fiches.length ? '<div class="list">' + fiches.map(ligneFiche).join('') + '</div>'
        : '<p class="empty">' + (l.statut === 'EN COURS' ? 'Incorporation programmée : la fiche n\'est pas encore arrivée.' : 'Aucune fiche pour ce logement.') + '</p>');
  }

  // ------------------------------------------------------------ export Excel du tableau de bord
  async function exporter() {
    var classeur = new root.ExcelJS.Workbook();
    var f1 = classeur.addWorksheet('Chantiers');
    f1.columns = [
      { header: 'Chantier', key: 'chantier', width: 34 }, { header: 'Logements', key: 'logements', width: 11 },
      { header: 'Validés', key: 'valides', width: 9 }, { header: 'À valider', key: 'a_valider', width: 10 },
      { header: 'Anomalies', key: 'anomalies', width: 11 }, { header: 'En cours', key: 'en_cours', width: 10 },
      { header: 'À faire', key: 'a_faire', width: 9 }, { header: '% validés', key: 'pct', width: 10 },
      { header: 'Fiches à contrôler', key: 'a_controler', width: 17 }, { header: 'Prochain coulage', key: 'coulage', width: 16 },
      { header: 'Points qui reviennent', key: 'points_memoire', width: 20 }
    ];
    var f2 = classeur.addWorksheet('Logements');
    f2.columns = [{ header: 'Chantier', key: 'chantier', width: 34 }, { header: 'Bâtiment', key: 'batiment', width: 12 },
      { header: 'Niveau', key: 'niveau', width: 9 }, { header: 'Logement', key: 'code', width: 10 }, { header: 'État', key: 'etat', width: 12 }];
    for (var i = 0; i < (ES.etat.tdb || []).length; i++) {
      var c = ES.etat.tdb[i];
      f1.addRow(Object.assign({}, c, { pct: pourcent(c.valides, c.logements) / 100, coulage: c.prochain_coulage ? o.frDate(c.prochain_coulage) + '/' + c.prochain_coulage.slice(0, 4) : '' }));
      (await root.Cloud.logements(c.chantier_id)).forEach(function (l) {
        f2.addRow({ chantier: c.chantier, batiment: l.batiment, niveau: l.niveau, code: l.code, etat: (COULEURS[l.statut] || [0, l.statut])[1] });
      });
    }
    f1.getColumn('pct').numFmt = '0 %';
    [f1, f2].forEach(function (f) { f.getRow(1).font = { bold: true }; f.views = [{ state: 'frozen', ySplit: 1 }]; });
    var octets = await classeur.xlsx.writeBuffer();
    var lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    lien.download = 'Tableau_de_bord_incorporations_' + o.aujourdhui() + '.xlsx';
    document.body.appendChild(lien); lien.click(); lien.remove();
  }

  async function ouvrir() {
    ES.etat.ecran = { n: 'tdb' };
    ES.etat.tdbChantier = null;
    try { ES.etat.tdb = await root.Cloud.tdbChantiers(); } catch (e) { o.toast(e.message); }
    try { ES.etat.fiches = await root.Cloud.fichesVisibles(); } catch (e) { /* hors réseau : dernière liste */ }
  }
  var ACTIONS = {
    'zone-tdb': ouvrir,
    'tdb-chantier': async function (v) {
      ES.etat.ecran = { n: 'tdb-chantier', id: v };
      ES.etat.tdbChantier = null;
      ES.app.afficher();
      try {
        var r = await Promise.all([root.Cloud.logements(v), root.Cloud.fiches(v), root.Cloud.memoire(v)]);
        ES.etat.tdbChantier = { id: v, logements: r[0], fiches: r[1].filter(function (f) { return f.etat !== 'remplacee'; }), memoire: r[2] };
      } catch (e) { o.toast(e.message); ES.etat.ecran = { n: 'tdb' }; }
    },
    'logement': function (v) { var m = v.split('|'); ES.etat.feuille = { type: 'logement', niveau: m[0], code: m[1] }; },
    'export-tdb': async function () {
      try { await exporter(); o.toast('Tableau de bord exporté'); } catch (e) { o.toast('Export impossible : ' + e.message); }
    }
  };

  ES.tableau = { vue: vue, vueChantier: vueChantier, feuilleLogement: feuilleLogement, ouvrir: ouvrir, ACTIONS: ACTIONS };
})(window);
