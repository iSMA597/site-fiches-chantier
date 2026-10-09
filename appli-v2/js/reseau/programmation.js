/*
 * Appli V2, lot C : incorporations programmées (CONCEPTION_V2 § 12, décision 21).
 * Programmées dans l'appli ; le jour J, la fiche est pré-remplie ; à la réception, comparaison prévu / fait.
 * Une fiche sans programmation reste toujours possible (changement de plan, imprévu).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  function aVenir() {
    var jour = o.aujourdhui();
    return (ES.etat.programmations || []).filter(function (x) { return x.date_prevue >= jour; });
  }
  // patron ; conducteur du chantier ; chef de chantier : seulement celles qu'il a programmées (la base vérifie aussi)
  function peutGerer(x) {
    var p = ES.etat.profil, c = ES.assistant.chantier(x.chantier_id) || {};
    return p.role === 'admin' || (p.role === 'conducteur' && c.conducteur_id === ES.etat.monId) || (p.role === 'chef_chantier' && x.cree_par === ES.etat.monId);
  }
  function carte(x) {
    return o.glissable(carteSimple(x), [peutGerer(x) && { a: 'pg-annuler', v: x.id, t: 'Annuler', danger: true }], 'glisse--prog');
  }
  function carteSimple(x) {
    var c = ES.assistant.chantier(x.chantier_id) || { nom: '' };
    var demain = x.date_prevue === o.isoJour(o.dansJours(1));
    return '<div class="prog"><strong>' + (demain ? 'Demain' : 'Le ' + o.frDate(x.date_prevue)) + ' · ' + h(c.nom) + '</strong>' +
      '<div class="muted">' + h(ES.assistant.lieu(x)) + ' · coulage ' + (x.coulage ? o.frDate(x.coulage) : 'à préciser') + '</div>' +
      '<div class="muted">Équipe : ' + h([x.chef, x.chef_equipe].concat(x.compagnons || []).filter(Boolean).join(', ')) + '</div>' +
      '<div class="prog__btns"><button class="btn btn--sm btn--ghost" data-a="rappel-materiel" data-v="' + x.id + '">🧰 Matériel à préparer</button>' +
      (o.peutCreer(ES.etat.profil.role) ? '<button class="btn btn--sm btn--primary" data-a="demarrer" data-v="' + x.id + '">▶ Démarrer la fiche</button>' : '') + '</div>' +
      (peutGerer(x) ? '<div class="prog__btns"><button class="btn btn--sm btn--ghost" data-a="pg-modifier" data-v="' + x.id + '">✎ Modifier</button>' +
        '<button class="btn btn--sm btn--ghost txt-ko" data-a="pg-annuler" data-v="' + x.id + '">Annuler</button></div>' : '') + '</div>';
  }
  // section de l'accueil
  function section() {
    var liste = aVenir(), createur = o.peutCreer(ES.etat.profil.role);
    if (ES.etat.profil.role === 'facturation' || (!liste.length && !createur)) return '';   // facturation : fiches validées seulement
    return '<h3>📅 Incorporations programmées</h3>' + (liste.length ? liste.map(carte).join('') : '<p class="muted">Aucune pour l\'instant.</p>') +
      (createur ? '<button class="btn btn--ghost btn--block" data-a="programmer">＋ Programmer une incorporation</button>' +
        '<p class="muted petit">Une fiche peut toujours être créée sans programmation (changement de plan, imprévu).</p>' : '');
  }

  // ------------------------------------------------------------ écran « Programmer »
  function puce(action, valeur, active, texte, desactivee) {
    return '<button class="chip" data-a="' + action + '" data-v="' + h(valeur) + '" aria-pressed="' + active + '"' + (desactivee ? ' disabled' : '') + '>' + h(texte) + '</button>';
  }
  var numeroChamp = 0;
  function champ(titre, contenu) {
    var id = 'prog-champ-' + (++numeroChamp);
    return '<div class="field" role="group" aria-labelledby="' + id + '"><div class="field__l" id="' + id + '">' + titre + '</div><div class="chips">' + contenu + '</div></div>';
  }
  function vueProgrammer() {
    var f = ES.etat.programmation, r = ES.etat.registre;
    var c = ES.assistant.chantier(f.chantier_id), bt = c && c.batiments.filter(function (b) { return b.id === f.batiment_id; })[0];
    var nv = bt && bt.niveaux.filter(function (n) { return n.id === f.niveau_id; })[0];
    var out = '<p class="lead">La veille, l\'équipe reçoit un rappel (matériel, points souvent oubliés). Le jour J, la fiche est pré-remplie.</p>';
    out += champ('Chantier', (r.chantiers || []).map(function (x) { return puce('pg-chantier', x.id, f.chantier_id === x.id, x.nom); }).join(''));
    if (c) out += champ('Bâtiment', c.batiments.map(function (x) { return puce('pg-batiment', x.id, f.batiment_id === x.id, x.nom); }).join(''));
    if (bt) out += champ('Niveau', bt.niveaux.map(function (x) { return puce('pg-niveau', x.id, f.niveau_id === x.id, o.nivL(x.num)); }).join(''));
    if (nv) {
      var codes = [];
      for (var k = 1; k <= nv.logements; k++) codes.push(o.codeLogement(nv.num, k));
      out += champ('Logements <small>6 max</small>', codes.map(function (cd) {
        var pris = f.logements.indexOf(cd) >= 0;
        return puce('pg-logement', cd, pris, cd, !pris && f.logements.length >= ES.brouillon.LOGEMENTS_MAX);
      }).join(''));
    }
    out += champ('Date de l\'incorporation', o.calendrier('pg-date-prevue', f.date_prevue, o.aujourdhui(), 'Date de l\'incorporation'));
    out += champ('Coulage prévu', o.calendrier('pg-date-coulage', f.coulage, f.date_prevue || o.aujourdhui(), 'Date du coulage prévu'));
    out += champ('Chef de chantier', (r.chefs || []).map(function (n) { return puce('pg-chef', n, f.chef === n, n); }).join(''));
    out += champ('Compagnons', (r.compagnons || []).map(function (n) { return puce('pg-compagnon', n, f.compagnons.indexOf(n) >= 0, n); }).join(''));
    var complet = f.chantier_id && f.batiment_id && f.niveau_id && f.logements.length && f.date_prevue && f.compagnons.length;
    out += (complet ? '' : '<p class="foot__hint">Complétez le chantier, l\'emplacement, la date et au moins 1 compagnon</p>') +
      '<button class="btn btn--primary btn--big" data-a="pg-enregistrer"' + (complet ? '' : ' disabled') + '>' + (f.id ? '✓ Enregistrer les modifications' : '📅 Programmer') + '</button>';
    return { haut: '<div class="top"><button class="top__back" data-a="accueil" aria-label="Retour">‹</button><div class="top__t"><strong>' + (f.id ? 'Modifier' : 'Programmer') + '</strong><span>Une incorporation à venir</span></div></div>',
      contenu: out, bas: '' };
  }

  // ------------------------------------------------------------ comparaison prévu / fait (à la réception)
  function comparaison(f) {
    var prevue = (ES.etat.programmations || []).filter(function (x) {
      return x.chantier_id === f.chantier_id && x.batiment_id === f.batiment_id && x.niveau_id === f.niveau_id;
    }).sort(function (a, b) { return a.date_prevue < b.date_prevue ? 1 : -1; })[0];
    if (!prevue) return '<div class="info"><b>🔎 Fiche hors planning</b> : aucune incorporation n\'était programmée ici. Elle a été créée sur place (changement de plan, imprévu…).</div>';
    var restants = prevue.logements.filter(function (l) { return f.logements.indexOf(l) < 0; });
    var enPlus = f.logements.filter(function (l) { return prevue.logements.indexOf(l) < 0; });
    var lignes = [(prevue.date_prevue === f.date_fiche ? '✓' : '⚠') + ' Prévue le ' + o.frDate(prevue.date_prevue) + ', faite le ' + o.frDate(f.date_fiche),
      restants.length ? '⚠ Logements prévus mais pas sur cette fiche : <b>' + h(restants.join(' ')) + '</b>' : '✓ Tous les logements prévus sont sur la fiche'];
    if (enPlus.length) lignes.push('ℹ Logements en plus du planning : ' + h(enPlus.join(' ')));
    return '<div class="' + (restants.length ? 'warnbox' : 'info') + '"><b>🔎 Comparaison avec le planning</b><ul>' + lignes.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul></div>';
  }

  // ------------------------------------------------------------ rappels de la veille (ouverts depuis la notification ou la carte)
  var CLE_PREPARATION = ((root.ES_CONFIG && root.ES_CONFIG.prefixe) || 'es2_') + 'preparation';   // cases cochées, gardées sur ce téléphone
  function preparation() { try { return JSON.parse(localStorage.getItem(CLE_PREPARATION) || '{}'); } catch (e) { return {}; } }
  function boiteMemoire(memoire, titre) {
    if (!memoire || !memoire.length) return '<div class="lock">👍 Aucun point oublié en mémoire sur ce chantier</div>';
    return '<div class="warnbox"><b>🧠 ' + titre + '</b><ul>' + memoire.map(function (m) {
      return '<li>' + h(m.label) + ' <small>(' + m.fois + '×)</small></li>';
    }).join('') + '</ul></div>';
  }
  function listeACocher(programmationId, section, titre) {
    var coches = preparation()[programmationId] || [];
    var prets = section.points.filter(function (pt) { return coches.indexOf(pt.id) >= 0; }).length;
    return '<h5>' + titre + ' <small class="muted">' + prets + '/' + section.points.length + ' prêt' + (prets > 1 ? 's' : '') + '</small></h5>' +
      section.points.map(function (pt) {
        var coche = coches.indexOf(pt.id) >= 0;
        return '<button class="pick pick--ok" data-a="coche-materiel" data-v="' + programmationId + '|' + pt.id + '" aria-pressed="' + coche + '">' +
          (coche ? '☑' : '☐') + ' ' + h(pt.label) + '</button>';
      }).join('');
  }
  function feuilleMateriel() {
    var f = ES.etat.feuille, x = (ES.etat.programmations || []).filter(function (p) { return p.id === f.id; })[0];
    var fermer = '<button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button>';
    if (!x) return '<div class="sheet__h"><strong>Incorporation</strong>' + fermer + '</div><p class="empty">Programmation introuvable.</p>';
    var c = ES.assistant.chantier(x.chantier_id) || { nom: '' }, sections = ES.gabarit.sectionsV2();
    var demain = x.date_prevue === o.isoJour(o.dansJours(1));
    return '<div class="sheet__h"><strong>' + (demain ? 'Demain' : 'Le ' + o.frDate(x.date_prevue)) + ' : incorporation</strong>' + fermer + '</div>' +
      '<p class="muted">' + h(c.nom) + ' · ' + h(ES.assistant.lieu(x)) + ' · coulage ' + (x.coulage ? o.frDate(x.coulage) : 'à préciser') + '</p>' +
      boiteMemoire(f.memoire, 'Points déjà oubliés sur ce chantier') +
      listeACocher(x.id, sections[1], '🧰 Matériel à préparer ce soir') +
      listeACocher(x.id, sections[0], '📄 Documents à avoir');
  }
  function feuilleCoulage() {
    var f = ES.etat.feuille, c = ES.assistant.chantier(f.chantier) || { nom: '' };
    var fiches = (ES.etat.fiches || []).filter(function (x) { return x.chantier_id === f.chantier && x.coulage === f.jour && x.etat !== 'remplacee'; });
    var nonValidees = fiches.filter(function (x) { return x.etat !== 'validee'; }).length;
    return '<div class="sheet__h"><strong>Coulage demain : ' + h(c.nom) + '</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      (nonValidees ? '<div class="alert">⚠ ' + o.pluriel(nonValidees, 'fiche') + ' pas encore validée(s) : pas de coulage sans la validation du conducteur.</div>'
        : '<div class="lock">✓ Toutes les fiches de ce coulage sont validées</div>') +
      '<div class="list">' + fiches.map(function (x) {
        var st = ES.reception.statut(x);
        return '<button class="row-btn" data-a="ouvrir" data-v="' + x.id + '"><div class="row-btn__main"><strong>' + h(ES.assistant.lieu(x)) + '</strong>' +
          '<span class="pills"><span class="pill ' + st[1] + '">' + st[0] + '</span></span></div><span class="chev" aria-hidden="true">›</span></button>';
      }).join('') + '</div>' +
      boiteMemoire(f.memoire, 'Points qui reviennent sur ce chantier') +
      '<h5>Avant de couler</h5><ul class="matlist">' + ES.gabarit.rappels().slice(2, 5).map(function (r) { return '<li>' + h(r) + '</li>'; }).join('') + '</ul>';
  }
  // charge la mémoire du chantier avant d'afficher une feuille de rappel
  async function preparerFeuille(feuille) {
    var chantierId = feuille.chantier;
    if (feuille.type === 'rappel-materiel') {
      var x = (ES.etat.programmations || []).filter(function (p) { return p.id === feuille.id; })[0];
      chantierId = x && x.chantier_id;
    }
    feuille.memoire = [];
    if (chantierId) { try { feuille.memoire = await root.Cloud.memoire(chantierId); } catch (e) { /* hors réseau */ } }
  }

  function basculer(liste, v) { return liste.indexOf(v) >= 0 ? liste.filter(function (x) { return x !== v; }) : liste.concat([v]); }
  var ACTIONS = {
    'rappel-materiel': async function (v) {
      ES.etat.feuille = { type: 'rappel-materiel', id: v };
      await preparerFeuille(ES.etat.feuille);
    },
    'coche-materiel': function (v) {
      var morceaux = v.split('|'), toutes = preparation();
      toutes[morceaux[0]] = basculer(toutes[morceaux[0]] || [], morceaux[1]);
      try { localStorage.setItem(CLE_PREPARATION, JSON.stringify(toutes)); } catch (e) { o.toast('Mémoire du téléphone pleine'); }
    },
    'programmer': function () {
      ES.etat.programmation = { chantier_id: null, batiment_id: null, niveau_id: null, logements: [], date_prevue: null, coulage: null,
        chef: ES.etat.profil.role === 'chef_chantier' ? ES.etat.profil.nom : null, chef_equipe: null, compagnons: [] };
      ES.etat.ecran = { n: 'programmer' };
    },
    'pg-chantier': function (v) {
      var f = ES.etat.programmation, c = ES.assistant.chantier(v);
      Object.assign(f, { chantier_id: v, batiment_id: c.batiments.length === 1 ? c.batiments[0].id : null, niveau_id: null, logements: [] });
    },
    'pg-batiment': function (v) { Object.assign(ES.etat.programmation, { batiment_id: v, niveau_id: null, logements: [] }); },
    'pg-niveau': function (v) { Object.assign(ES.etat.programmation, { niveau_id: v, logements: [] }); },
    'pg-logement': function (v) { var f = ES.etat.programmation; f.logements = basculer(f.logements, v).sort(); },
    'pg-date': function (v) { ES.etat.programmation.date_prevue = v; },
    'pg-coulage': function (v) { ES.etat.programmation.coulage = v; },
    'pg-chef': function (v) { ES.etat.programmation.chef = v; },
    'pg-compagnon': function (v) { var f = ES.etat.programmation; f.compagnons = basculer(f.compagnons, v); },
    'pg-enregistrer': async function () {
      try {
        if (ES.etat.programmation.id) await root.Cloud.modifierProgrammation(ES.etat.programmation);
        else await root.Cloud.programmer(ES.etat.programmation);
        o.toast(ES.etat.programmation.id ? 'Programmation modifiée' : 'Incorporation programmée');
        ES.etat.ecran = { n: 'accueil' };
        await ES.app.rafraichirListe();
      } catch (e) { o.toast(e.message); }
    },
    'pg-modifier': function (v) {
      var x = (ES.etat.programmations || []).filter(function (p) { return p.id === v; })[0];
      if (!x) return;
      ES.etat.programmation = Object.assign({}, x, { logements: x.logements.slice(), compagnons: (x.compagnons || []).slice() });
      ES.etat.ecran = { n: 'programmer' };
    },
    'pg-annuler': async function (v) {
      var x = (ES.etat.programmations || []).filter(function (p) { return p.id === v; })[0];
      if (!x || !root.confirm('Annuler l\'incorporation prévue le ' + o.frDate(x.date_prevue) + ' ? L\'équipe ne recevra plus le rappel.')) return;
      await root.Cloud.annulerProgrammation(v);
      o.toast('Programmation annulée');
      await ES.app.rafraichirListe();
    },
    'demarrer': async function (v) {
      if (!(await ES.brouillon.remplacerAvecAccord())) return;
      var x = (ES.etat.programmations || []).filter(function (p) { return p.id === v; })[0];
      var b = ES.brouillon.nouveau(ES.etat.profil);
      Object.assign(b, { chantier_id: x.chantier_id, batiment_id: x.batiment_id, niveau_id: x.niveau_id, logements: x.logements.slice(),
        coulage: x.coulage, chef: x.chef || b.chef, chef_equipe: x.chef_equipe, compagnons: (x.compagnons || []).slice() });
      b.etape = b.coulage ? 4 : 3;                       // chantier, emplacement et équipe déjà remplis
      b.vues = b.etape;
      ES.etat.brouillon = b;
      ES.brouillon.sauver(b);
      ES.etat.photos = [];
      await ES.assistant.chargerMemoire(b.chantier_id);
      ES.etat.ecran = { n: 'assistant' };
      o.toast('Chantier, emplacement et équipe déjà remplis');
    }
  };

  ES.programmation = { section: section, vueProgrammer: vueProgrammer, comparaison: comparaison, ACTIONS: ACTIONS,
    feuilleMateriel: feuilleMateriel, feuilleCoulage: feuilleCoulage, preparerFeuille: preparerFeuille };
})(window);
