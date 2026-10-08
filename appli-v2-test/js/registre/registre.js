/*
 * Appli V2, lot E : onglet « Registre » (patron et conducteur), comme la maquette validée.
 *  - Chantiers : liste, infos, structure (logements par niveau, boutons + et −), plans par niveau (indice,
 *    alerte de nouvel indice dans Alobees), équipe affectée ; import depuis Alobees ou depuis un fichier.
 *  - Personnes : voir js/registre/personnes.js.
 * Le patron modifie tout ; le conducteur modifie ses chantiers et lit le reste.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  function patron() { return ES.etat.profil.role === 'admin'; }
  function peutModifier(c) { return patron() || (c && c.conducteur_id === ES.etat.monId); }
  // chantier ouvert dans le Registre (gardé même quand on passe sur un écran d'import)
  function chantierOuvert() { return (ES.etat.reg.chantiers || []).filter(function (c) { return c.id === ES.etat.reg.chantierId; })[0]; }
  function nomProfil(id) { var p = (ES.etat.reg.profils || []).filter(function (x) { return x.id === id; })[0]; return p ? p.nom : ''; }
  function nbLogements(c) {
    return (c.batiments || []).reduce(function (t, b) { return t + (b.niveaux || []).reduce(function (s, n) { return s + n.nb_logements; }, 0); }, 0);
  }
  function batimentsTries(c) {
    return (c.batiments || []).slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); }).map(function (b) {
      return { id: b.id, nom: b.nom, niveaux: (b.niveaux || []).slice().sort(function (x, y) { return x.num - y.num; }) };
    });
  }
  function haut(titre, sousTitre, retour) {
    var p = ES.etat.profil;
    return '<div class="top">' + (retour ? '<button class="top__back" data-a="' + retour + '" aria-label="Retour">‹</button>'
      : '<img class="top__logo" src="icons/logo.png" alt="Euro Sanichauff">') +
      '<div class="top__t"><strong>' + h(titre) + '</strong><span>' + h(sousTitre) + '</span></div>' +
      '<button class="avatar" data-a="compte" aria-label="Mon compte : ' + h(p.nom) + '">' + o.initiales(p.nom) + '</button></div>';
  }

  // ------------------------------------------------------------ données
  async function charger() {
    var r = await Promise.all([root.Cloud.chantiersDetail(), root.Cloud.profils(), root.Cloud.plansPerimes().catch(function () { return []; })]);
    ES.etat.reg = Object.assign(ES.etat.reg || {}, { chantiers: r[0], profils: r[1], perimes: r[2] });
  }
  async function chargerPlans(chantierId) { ES.etat.reg.plans = await root.Cloud.plans(chantierId); }
  async function ouvrir() {
    ES.etat.ecran = { n: 'reg' };
    ES.etat.reg = ES.etat.reg || { segment: 'ch' };
    try { await charger(); } catch (e) { o.toast(e.message); }
  }

  // ------------------------------------------------------------ liste
  function vue() {
    var seg = ES.etat.reg.segment || 'ch';
    var out = '<div class="segment" role="tablist"><button data-a="reg-segment" data-v="ch" aria-pressed="' + (seg === 'ch') + '">Chantiers</button>' +
      '<button data-a="reg-segment" data-v="pers" aria-pressed="' + (seg === 'pers') + '">Personnes</button></div>';
    out += seg === 'pers' ? ES.personnes.vue() : vueChantiers();
    return { haut: haut('Registre', patron() ? 'Administration' : 'Lecture · vos chantiers modifiables'), contenu: out, bas: ES.onglets.barre('reg') };
  }
  function vueChantiers() {
    var liste = ES.etat.reg.chantiers || [];
    var out = patron() ? '' : '<div class="info">Lecture seule, sauf vos chantiers (modifiables).</div>';
    // nouveaux chantiers détectés dans Alobees : le patron ou le conducteur les ajoute d'un appui
    if (patron() || ES.etat.profil.role === 'conducteur') {
      out += '<button class="btn btn--primary btn--block foot__row--marge" data-a="alobees-recos">🔎 Nouveaux chantiers détectés dans Alobees</button>';
    }
    out += '<div class="list">' + liste.map(function (c) {
      return '<button class="row-btn" data-a="reg-chantier" data-v="' + c.id + '"><div class="row-btn__main"><strong>' + h(c.nom) + '</strong>' +
        '<span>' + h(c.adresse || '') + ' · ' + (c.batiments || []).length + ' bât. · ' + nbLogements(c) + ' logements' +
        (c.conducteur_id ? ' · conducteur ' + h(nomProfil(c.conducteur_id)) : '') + '</span></div>' +
        (c.actif === false ? '<span class="pill p-attente">archivé</span>' : '') +
        (peutModifier(c) ? '<span class="pill p-envoyee">modifiable</span>' : '') + '<span class="chev" aria-hidden="true">›</span></button>';
    }).join('') + '</div>';
    if (patron()) {
      out += '<button class="btn btn--ghost btn--block foot__row--marge" data-a="alobees-chantiers">⇩ Importer des chantiers depuis Alobees</button>' +
        '<button class="btn btn--primary btn--block foot__row--marge" data-a="chantier-nouveau">＋ Nouveau chantier</button>';
    }
    return out;
  }

  // ------------------------------------------------------------ un chantier
  function stepper(action, valeur, nb, libelle) {
    return '<span class="stepper"><button data-a="' + action + '" data-v="' + valeur + '|-1" aria-label="Un logement de moins (' + h(libelle) + ')">−</button>' +
      '<b>' + nb + '</b><button data-a="' + action + '" data-v="' + valeur + '|1" aria-label="Un logement de plus (' + h(libelle) + ')">+</button></span>';
  }
  function blocStructure(c, ed) {
    return batimentsTries(c).map(function (b) {
      return '<div class="bat"><h4>' + h(b.nom) + '</h4>' + b.niveaux.map(function (n) {
        var plage = n.nb_logements ? o.codeLogement(n.num, 1) + ' → ' + o.codeLogement(n.num, n.nb_logements) : 'aucun';
        return '<div class="struct-row"><span>' + o.nivL(n.num) + ' · <span class="muted">' + plage + '</span></span>' +
          (ed ? stepper('reg-nb', b.id + '|' + n.num, n.nb_logements, b.nom + ' ' + o.nivL(n.num)) : '<b>' + n.nb_logements + ' logements</b>') + '</div>';
      }).join('') + (ed ? '<button class="link" data-a="reg-ajout-niveau" data-v="' + b.id + '">＋ Ajouter un niveau</button>' : '') + '</div>';
    }).join('') + (ed ? '<button class="link" data-a="reg-ajout-batiment">＋ Ajouter un bâtiment</button>' : '');
  }
  function blocPlans(c, ed) {
    var plans = ES.etat.reg.plans || [], perimes = (ES.etat.reg.perimes || []).filter(function (x) { return x.chantier_id === c.id; });
    var out = '<h3>Plans par niveau</h3>';
    if (perimes.length) {
      out += '<div class="alert">⚠ ' + o.pluriel(perimes.length, 'nouvel indice') + ' dans Alobees : ' + perimes.map(function (x) {
        return h(lieuNiveau(c, x.niveau_id)) + ' (indice ' + h(x.indice_dispo) + ', actuel ' + h(x.indice_actuel) + ')';
      }).join(', ') + '. Mettez à jour avant la prochaine incorporation.</div>';
    }
    out += '<div class="card">' + batimentsTries(c).map(function (b) {
      return b.niveaux.map(function (n) {
        var plan = plans.filter(function (p) { return p.niveau_id === n.id; })[0];
        var perime = perimes.filter(function (x) { return x.niveau_id === n.id; })[0];
        return '<div class="struct-row"><span>' + h(b.nom) + ' · ' + o.nivL(n.num) +
          (perime ? ' <span class="pill p-ko">⚠ ind ' + h(perime.indice_dispo) + ' dispo</span>' : '') + '</span>' +
          (plan ? '<button class="btn btn--sm btn--ghost" data-a="reg-voir-plan" data-v="' + plan.id + '">🗺 Plan' + (plan.indice ? ' indice ' + h(plan.indice) : '') + '</button>'
            : (ed ? '<button class="btn btn--sm btn--ghost" data-a="reg-plan-ajout" data-v="' + n.id + '">＋ PDF / photo</button>' : '<span class="muted">pas de plan</span>')) +
          '</div>';
      }).join('');
    }).join('') + '</div>';
    if (ed && c.alobees_id) out += '<button class="btn btn--ghost btn--block foot__row--marge" data-a="alobees-plans">⇩ Récupérer les plans depuis Alobees</button>';
    return out;
  }
  function lieuNiveau(c, niveauId) {
    var trouve = '';
    batimentsTries(c).forEach(function (b) { b.niveaux.forEach(function (n) { if (n.id === niveauId) trouve = b.nom + ' ' + o.nivL(n.num); }); });
    return trouve;
  }
  function blocEquipe(c, ed) {
    var affectes = (c.affectations || []).map(function (a) { return a.profile_id; });
    var candidats = (ES.etat.reg.profils || []).filter(function (p) { return p.actif && (p.role === 'chef_chantier' || p.role === 'compagnon' || p.role === 'conducteur'); });
    var out = '<h3>Équipe affectée</h3><p class="muted">Les personnes affectées voient le chantier dans l\'appli (le patron et la facturation voient tout).</p><div class="chips">';
    out += ed ? candidats.map(function (p) {
      var pris = affectes.indexOf(p.id) >= 0;
      return '<button class="chip" data-a="reg-affecter" data-v="' + p.id + '" aria-pressed="' + pris + '">' + h(p.nom) + '</button>';
    }).join('') : (affectes.length ? affectes.map(function (id) { return '<span class="chip">' + h(nomProfil(id)) + '</span>'; }).join('') : '<span class="muted">personne</span>');
    return out + '</div>';
  }
  function vueChantier() {
    var c = chantierOuvert();
    if (!c) return { haut: haut('Registre', '', 'reg-retour'), contenu: '<p class="empty">Chantier introuvable.</p>', bas: ES.onglets.barre('reg') };
    var ed = peutModifier(c);
    var out = ed ? '' : '<div class="info">Lecture seule.</div>';
    out += '<h3>Infos</h3><div class="card"><dl class="kv"><dt>Adresse</dt><dd>' + h(c.adresse || '—') + '</dd><dt>Client</dt><dd>' + h(c.client || '—') + '</dd>' +
      '<dt>Dates</dt><dd>' + (c.debut ? o.frDate(c.debut) + '/' + c.debut.slice(0, 4) : '?') + ' → ' + (c.fin ? o.frDate(c.fin) + '/' + c.fin.slice(0, 4) : '?') + '</dd>' +
      '<dt>Conducteur</dt><dd>' + h(nomProfil(c.conducteur_id) || '—') + '</dd>' +
      '<dt>Alobees</dt><dd>' + (c.alobees_id ? 'relié' : 'non relié') + '</dd></dl>' +
      (ed ? '<button class="btn btn--sm btn--ghost" data-a="chantier-modifier">✎ Modifier les infos</button>' : '') + '</div>';
    out += '<h3>Structure</h3>' + blocStructure(c, ed);
    out += blocPlans(c, ed) + blocEquipe(c, ed);
    if (ed) {
      out += '<h3>Importer la structure</h3><p class="lead">Depuis la liste des lots, un descriptif ou un tableau du client. L\'appli fait une proposition, vous vérifiez, puis vous enregistrez.</p>' +
        '<label class="btn btn--ghost btn--block">📊 Excel / CSV / 📄 PDF<input type="file" accept=".xlsx,.csv,.pdf,application/pdf" data-saisie="import-structure" class="vh"></label>';
    }
    out += blocFinChantier(c);
    return { haut: haut('Registre', c.nom, 'reg-retour'), contenu: out, bas: ES.onglets.barre('reg') };
  }
  // archiver / réactiver : patron ou conducteur du chantier ; supprimer : patron, chantier sans aucune fiche
  function blocFinChantier(c) {
    if (!peutModifier(c)) return '';
    var out = '<h3>Fin du chantier</h3><div class="card">';
    out += c.actif === false
      ? '<p class="muted">Chantier archivé : il n\'apparaît plus pour les fiches. L\'historique (fiches, plans) est gardé.</p>' +
        '<button class="btn btn--ok btn--block" data-a="chantier-reactiver">↺ Réactiver le chantier</button>'
      : '<p class="muted">Archiver : le chantier disparaît des listes pour les fiches ; l\'historique (fiches, plans) est gardé.</p>' +
        '<button class="btn btn--ghost btn--block" data-a="chantier-archiver">🗄 Archiver le chantier</button>';
    if (patron()) {
      out += '<p class="muted foot__row--marge">Supprimer : seulement un chantier ajouté par erreur, qui n\'a aucune fiche.</p>' +
        '<button class="btn btn--ko btn--block" data-a="chantier-supprimer">🗑 Supprimer le chantier</button>';
    }
    return out + '</div>';
  }
  function feuilleSupprimer() {
    var f = ES.etat.feuille, c = chantierOuvert() || {};
    return '<div class="sheet__h"><strong>Supprimer « ' + h(c.nom || '') + ' » ?</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<p>Le chantier, ses bâtiments, niveaux, plans et programmations sont <b>supprimés définitivement</b>. ' +
      'Impossible s\'il a déjà des fiches : archivez-le plutôt.</p>' +
      (c.alobees_id ? '<label class="check check--petit"><input type="checkbox" data-a="chantier-supprimer-alobees"' + (f.nePlusProposer ? ' checked' : '') + '>' +
        '<span>Ne plus le proposer depuis Alobees<small>Il restera dans Alobees ; « Rétablir » dans « Nouveaux chantiers » le fait revenir.</small></span></label>' : '') +
      '<div class="foot__row foot__row--marge"><button class="btn btn--ghost" data-a="fermer-feuille">Annuler</button>' +
      '<button class="btn btn--ko" data-a="chantier-supprimer-ok">🗑 Supprimer</button></div>';
  }
  async function apresChangementChantier() {
    await charger();
    await ES.app.rafraichirRegistreFiches();
  }

  // ------------------------------------------------------------ enregistrement de la structure (fonction existante sauverChantier)
  function structureDe(c) {
    var lignes = [];
    batimentsTries(c).forEach(function (b) {
      b.niveaux.forEach(function (n) { lignes.push({ bid: b.id, batiment: b.nom, num: n.num, nb: n.nb_logements }); });
    });
    return lignes;
  }
  async function enregistrer(c, structure, affectes) {
    try {
      var r = await root.Cloud.sauverChantier(c, structure || structureDe(c), affectes || (c.affectations || []).map(function (a) { return a.profile_id; }));
      if (r.avertissements && r.avertissements.length) o.toast(r.avertissements.join(' · '));
      await charger();
      await ES.app.rafraichirRegistreFiches();
      return r.chantier;
    } catch (e) { o.toast(e.message, true); await charger(); return null; }
  }

  // ------------------------------------------------------------ feuilles : infos du chantier, ajout d'un plan
  function feuilleInfos() {
    var f = ES.etat.feuille, c = f.id ? chantierOuvert() : {};
    var conducteurs = (ES.etat.reg.profils || []).filter(function (p) { return p.actif && p.role === 'conducteur'; });
    var champ = function (libelle, nom, valeur, type) {
      return '<label class="field__l">' + libelle + '<input class="inp" name="' + nom + '" type="' + (type || 'text') + '" value="' + h(valeur || '') + '"></label>';
    };
    return '<div class="sheet__h"><strong>' + (f.id ? 'Modifier le chantier' : 'Nouveau chantier') + '</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<form class="form-col" data-formulaire="chantier-infos">' + champ('Nom', 'nom', c.nom) + champ('Adresse', 'adresse', c.adresse) + champ('Client', 'client', c.client) +
      '<div class="form-2col">' + champ('Début', 'debut', c.debut, 'date') + champ('Fin', 'fin', c.fin, 'date') + '</div>' +
      '<label class="field__l">Conducteur<select class="inp" name="conducteur_id"' + (patron() ? '' : ' disabled') + '><option value="">—</option>' +
      conducteurs.map(function (p) { return '<option value="' + p.id + '"' + (p.id === c.conducteur_id ? ' selected' : '') + '>' + h(p.nom) + '</option>'; }).join('') +
      '</select></label><button class="btn btn--primary btn--big" type="submit">Enregistrer</button></form>';
  }
  function feuillePlan() {
    var f = ES.etat.feuille, c = chantierOuvert();
    return '<div class="sheet__h"><strong>Plan · ' + h(lieuNiveau(c, f.niveau)) + '</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<form class="form-col" data-formulaire="plan-ajout">' +
      '<label class="field__l">Fichier (PDF ou photo)<input class="inp" name="fichier" type="file" accept="application/pdf,image/*" required></label>' +
      '<label class="field__l">Indice du plan<input class="inp" name="indice" maxlength="4" placeholder="ex. A, B, C" autocapitalize="characters"></label>' +
      '<button class="btn btn--primary btn--big" type="submit">Enregistrer le plan</button></form>';
  }

  var FORMULAIRES = {
    'chantier-infos': async function (form) {
      var d = new FormData(form), c = ES.etat.feuille.id ? Object.assign({}, chantierOuvert()) : {};
      ['nom', 'adresse', 'client', 'debut', 'fin'].forEach(function (k) { c[k] = String(d.get(k) || '').trim(); });
      if (patron()) c.conducteur_id = d.get('conducteur_id') || null;
      if (!c.nom) { o.toast('Indiquez le nom du chantier'); return; }
      var nouveau = !c.id;
      ES.etat.feuille = null;
      var enregistre = await enregistrer(c, nouveau ? [] : structureDe(chantierOuvert()), nouveau ? [] : null);
      if (nouveau) {
        var cree = enregistre && (ES.etat.reg.chantiers || []).filter(function (x) { return x.id === enregistre.id; })[0];
        if (cree) { ES.etat.ecran = { n: 'reg-chantier', id: cree.id }; ES.etat.reg.chantierId = cree.id; await chargerPlans(cree.id); }
      }
    },
    'plan-ajout': async function (form) {
      var d = new FormData(form), fichier = d.get('fichier'), f = ES.etat.feuille, c = chantierOuvert();
      if (!fichier || !fichier.size) { o.toast('Choisissez un fichier'); return; }
      var bat = batimentsTries(c).filter(function (b) { return b.niveaux.some(function (n) { return n.id === f.niveau; }); })[0];
      try {
        await root.Cloud.ajouterPlan(c.id, fichier, fichier.name, bat && bat.id, f.niveau, String(d.get('indice') || '').trim().toUpperCase());
        ES.etat.feuille = null;
        await chargerPlans(c.id);
        o.toast('Plan enregistré');
      } catch (e) { o.toast(e.message); }
    }
  };

  // ------------------------------------------------------------ actions
  function modifierNiveaux(c, bid, modif) {
    var structure = structureDe(c);
    modif(structure);
    return enregistrer(c, structure);
  }
  var ACTIONS = {
    'reg-segment': async function (v) { ES.etat.reg.segment = v; if (v === 'pers') await ES.personnes.charger(); },
    'reg-retour': function () { ES.etat.ecran = { n: 'reg' }; },
    'reg-chantier': async function (v) {
      ES.etat.ecran = { n: 'reg-chantier', id: v };
      ES.etat.reg.chantierId = v;
      ES.etat.reg.plans = [];
      try { await chargerPlans(v); } catch (e) { o.toast(e.message); }
    },
    'chantier-nouveau': function () { ES.etat.feuille = { type: 'chantier-infos' }; },
    'chantier-archiver': async function () {
      var c = chantierOuvert();
      if (!root.confirm('Archiver « ' + c.nom + ' » ? Il ne sera plus proposé pour les fiches ; l\'historique est gardé.')) return;
      await root.Cloud.archiverChantier(c.id, false);
      o.toast('Chantier archivé');
      await apresChangementChantier();
    },
    'chantier-reactiver': async function () {
      await root.Cloud.archiverChantier(chantierOuvert().id, true);
      o.toast('Chantier réactivé');
      await apresChangementChantier();
    },
    'chantier-supprimer': function () { ES.etat.feuille = { type: 'chantier-supprimer', nePlusProposer: true }; },
    'chantier-supprimer-alobees': function (v, ev) { ES.etat.feuille.nePlusProposer = ev.target.checked; },
    'chantier-supprimer-ok': async function () {
      var c = chantierOuvert(), nePlus = ES.etat.feuille.nePlusProposer;
      ES.etat.feuille = null;
      await root.Cloud.supprimerChantier(c.id, nePlus);
      o.toast('« ' + c.nom + ' » supprimé');
      ES.etat.ecran = { n: 'reg' };
      await apresChangementChantier();
    },
    'chantier-modifier': function () { ES.etat.feuille = { type: 'chantier-infos', id: ES.etat.ecran.id }; },
    'reg-nb': function (v) {
      var m = v.split('|'), c = chantierOuvert();
      return modifierNiveaux(c, m[0], function (s) {
        s.forEach(function (l) { if (l.bid === m[0] && l.num === Number(m[1])) l.nb = Math.max(1, Math.min(99, l.nb + Number(m[2]))); });
      });
    },
    'reg-ajout-niveau': function (v) {
      var c = chantierOuvert();
      return modifierNiveaux(c, v, function (s) {
        var duBat = s.filter(function (l) { return l.bid === v; });
        var max = duBat.reduce(function (m, l) { return Math.max(m, l.num); }, -1);
        s.push({ bid: v, batiment: duBat.length ? duBat[0].batiment : 'Bât A', num: max + 1, nb: 4 });
      });
    },
    'reg-ajout-batiment': function () {
      var c = chantierOuvert(), pris = (c.batiments || []).map(function (b) { return b.nom; }), k = 0;
      while (pris.indexOf('Bât ' + String.fromCharCode(65 + k)) >= 0) k++;            // première lettre libre
      var lettre = String.fromCharCode(65 + k);
      var s = structureDe(c);
      s.push({ batiment: 'Bât ' + lettre, num: 0, nb: 3 }, { batiment: 'Bât ' + lettre, num: 1, nb: 3 });
      return enregistrer(c, s);
    },
    'reg-affecter': function (v) {
      var c = chantierOuvert(), affectes = (c.affectations || []).map(function (a) { return a.profile_id; });
      affectes = affectes.indexOf(v) >= 0 ? affectes.filter(function (x) { return x !== v; }) : affectes.concat([v]);
      return enregistrer(c, structureDe(c), affectes);
    },
    'reg-plan-ajout': function (v) { ES.etat.feuille = { type: 'plan-ajout', niveau: v }; },
    'reg-voir-plan': function (v) {
      var plan = (ES.etat.reg.plans || []).filter(function (p) { return p.id === v; })[0];
      return o.ouvrirOnglet(root.Cloud.urlPlan(plan));
    }
  };

  ES.registre = { ouvrir: ouvrir, charger: charger, vue: vue, vueChantier: vueChantier, feuilleInfos: feuilleInfos, feuilleSupprimer: feuilleSupprimer, feuillePlan: feuillePlan,
    chantierOuvert: chantierOuvert, batimentsTries: batimentsTries, structureDe: structureDe, enregistrer: enregistrer,
    chargerPlans: chargerPlans, FORMULAIRES: FORMULAIRES, ACTIONS: ACTIONS };
})(window);
