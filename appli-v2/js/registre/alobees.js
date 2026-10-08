/*
 * Appli V2, lot E : écrans d'import depuis Alobees (lecture seule, via la fonction serveur « alobees »).
 *  - chantiers (patron) ; plans d'un chantier (patron, conducteur du chantier) ; membres actifs (patron).
 * Les liens Alobees ne viennent jamais jusqu'au téléphone : le serveur copie les plans dans le stockage privé.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  var BANDEAU = '<div class="info">🔒 <b>Lecture seule</b> : l\'appli lit Alobees, elle n\'y modifie et n\'y supprime rien. La clé reste sur le serveur. ' +
    'Les liens Alobees ne sont jamais envoyés aux téléphones : le serveur garde sa propre copie des plans.</div>';
  function haut(titre, sousTitre) {
    return '<div class="top"><button class="top__back" data-a="alobees-retour" aria-label="Retour">‹</button>' +
      '<div class="top__t"><strong>' + h(titre) + '</strong><span>' + h(sousTitre) + '</span></div></div>';
  }
  function coche(action, valeur, active, contenu, desactivee) {
    return '<button class="pick pick--ok" data-a="' + action + '" data-v="' + h(valeur) + '" aria-pressed="' + active + '"' + (desactivee ? ' disabled' : '') + '>' +
      (active ? '☑' : '☐') + ' ' + contenu + '</button>';
  }
  function basculer(liste, v) { return liste.indexOf(v) >= 0 ? liste.filter(function (x) { return x !== v; }) : liste.concat([v]); }
  // plans : un seul fichier coché par niveau (sinon le dernier copié remplacerait l'autre sans prévenir)
  function niveauDu(a, docId) {
    var f = a.liste.filter(function (x) { return x.doc_id === docId; })[0];
    return a.associations[docId] || (f && f.niveau_id);
  }
  function cocherPlan(a, docId) {
    var niveau = niveauDu(a, docId);
    a.choix = a.choix.filter(function (x) { return x === docId || niveauDu(a, x) !== niveau; });
    if (a.choix.indexOf(docId) < 0) a.choix.push(docId);
  }
  function pied(action, nb, mot) {
    return '<div class="foot__row foot__row--marge"><button class="btn btn--ghost" data-a="alobees-retour">Annuler</button>' +
      '<button class="btn btn--ok" data-a="' + action + '"' + (nb ? '' : ' disabled') + '>Enregistrer ' + o.pluriel(nb, mot) + '</button></div>';
  }

  // ------------------------------------------------------------ écran
  function vue() {
    var a = ES.etat.alobees;
    if (!a.lu) return { haut: haut('Alobees', a.titre), contenu: BANDEAU + '<p class="empty">Lecture d\'Alobees…</p>', bas: '' };
    var corps = a.mode === 'chantiers' ? vueChantiers(a) : a.mode === 'membres' ? vueMembres(a)
      : a.mode === 'recos' ? (a.ajout ? vueAjout(a) : vueRecos(a)) : vuePlans(a);
    return { haut: haut('Alobees', a.titre), contenu: BANDEAU + corps, bas: '' };
  }

  // ------------------------------------------------------------ nouveaux chantiers détectés (patron, conducteur)
  function dateFr(iso) { return iso ? iso.split('-').reverse().join('/') : '—'; }
  function nbLogements(structure) {
    return structure.reduce(function (t, b) { return t + b.niveaux.reduce(function (u, n) { return u + n.logements; }, 0); }, 0);
  }
  function resumeStructure(structure) {
    return structure.map(function (b) { return h(b.nom) + ' : ' + b.niveaux.map(function (n) { return o.nivL(n.num); }).join(', '); }).join(' · ');
  }
  function carteReco(c) {
    var pret = c.etat === 'pret';
    return '<div class="card reco"><div class="reco__h"><strong>' + h(c.nom) + '</strong>' +
      '<span class="pill ' + (pret ? 'p-validee' : 'p-attente') + '">' + (pret ? 'plans prêts' : 'pas encore de plans') + '</span></div>' +
      '<dl class="kv"><dt>Client</dt><dd>' + h(c.client || '—') + '</dd><dt>Adresse</dt><dd>' + h(c.adresse || c.ville || '—') + '</dd>' +
      '<dt>Dates</dt><dd>' + dateFr(c.debut) + ' → ' + dateFr(c.fin) + (c.commence ? ' · <b>commencé</b>' : ' · à venir') + '</dd>' +
      (c.reference ? '<dt>Référence</dt><dd>' + h(c.reference) + '</dd>' : '') +
      '<dt>Plans d\'incorporation</dt><dd>' + (c.plans_incorporation.length ? c.plans_incorporation.map(function (p) {
        return h(p.bat) + ' ' + o.nivL(p.niv) + (p.ind ? ' (ind ' + h(p.ind) + ')' : '');
      }).join(', ') : 'aucun pour l\'instant') + '</dd>' +
      '<dt>Structure lue</dt><dd>' + (c.structure.length ? resumeStructure(c.structure) : 'à saisir') + '</dd></dl>' +
      '<div class="foot__row"><button class="btn btn--ghost" data-a="reco-ignorer" data-v="' + h(c.alobees_id) + '">Ignorer</button>' +
      '<button class="btn btn--ok" data-a="reco-ajouter" data-v="' + h(c.alobees_id) + '">＋ Ajouter au Registre</button></div></div>';
  }
  function vueRecos(a) {
    var r = a.liste;
    var out = '<p class="lead">Chantiers <b>ouverts</b> dans Alobees, <b>pas terminés</b> et <b>pas encore dans le Registre</b>, les plus récents d\'abord. ' +
      'Ajoutez ceux qui vous concernent : l\'appli crée le chantier, ses bâtiments et niveaux, et copie les plans d\'incorporation.</p>';
    out += r.chantiers.length ? r.chantiers.map(carteReco).join('') : '<p class="empty">Aucun nouveau chantier à ajouter.</p>';
    if (r.autres) out += '<p class="muted">… et ' + o.pluriel(r.autres, 'autre chantier') + ' ouvert(s) : ils apparaîtront ici quand les premiers seront traités.</p>';
    if (r.ignores.length) {
      out += '<h5>Chantiers ignorés</h5><div class="list">' + r.ignores.map(function (x) {
        return '<div class="pick pick--grise">' + h(x.nom) + ' <button class="link" data-a="reco-retablir" data-v="' + h(x.alobees_id) + '">Rétablir</button></div>';
      }).join('') + '</div>';
    }
    return out;
  }
  // confirmation avant l'ajout : logements par niveau à vérifier (pré-remplis d'après « NN logements »)
  function vueAjout(a) {
    var c = a.ajout, total = nbLogements(c.structure);
    var out = '<h3>' + h(c.nom) + '</h3><p class="lead">Vérifiez le nombre de logements de chaque niveau' +
      (c.total_logements ? ' (Alobees annonce <b>' + c.total_logements + ' logements</b>)' : '') + '. Tout reste modifiable ensuite dans le Registre.</p>';
    out += c.structure.map(function (b, i) {
      return '<div class="card"><strong>' + h(b.nom) + '</strong>' + b.niveaux.map(function (n, j) {
        return '<div class="row-niv"><span>' + o.nivL(n.num) + '</span><span class="stepper">' +
          '<button data-a="reco-logements" data-v="' + i + '|' + j + '|-1" aria-label="Un logement de moins">−</button><b>' + n.logements + '</b>' +
          '<button data-a="reco-logements" data-v="' + i + '|' + j + '|1" aria-label="Un logement de plus">+</button></span></div>';
      }).join('') + '<div class="foot__row"><button class="link" data-a="reco-niveau" data-v="' + i + '|-1">− niveau</button>' +
        '<button class="link" data-a="reco-niveau" data-v="' + i + '|1">＋ niveau</button></div></div>';
    }).join('') + '<button class="link" data-a="reco-batiment">＋ Ajouter un bâtiment</button>';
    var ecart = c.total_logements && total !== c.total_logements;
    out += '<p class="' + (ecart ? 'warnbox' : 'muted') + '">Total : <b>' + total + ' logements</b>' + (ecart ? ' (Alobees : ' + c.total_logements + ')' : '') + '</p>';
    return out + '<div class="foot__row foot__row--marge"><button class="btn btn--ghost" data-a="reco-annuler">Retour</button>' +
      '<button class="btn btn--ok" data-a="reco-confirmer"' + (c.structure.length ? '' : ' disabled') + '>Ajouter au Registre</button></div>';
  }
  async function relireRecos() {
    ES.etat.alobees.liste = await root.Cloud.alobees('recommandations');
  }
  var ACTIONS_RECOS = {
    'alobees-recos': function () {
      return ouvrir('recos', 'Nouveaux chantiers', function () { return root.Cloud.alobees('recommandations'); });
    },
    'reco-ajouter': function (v) {
      var c = ES.etat.alobees.liste.chantiers.filter(function (x) { return x.alobees_id === v; })[0];
      var structure = c.structure.length ? c.structure : [{ nom: 'Bât A', niveaux: [{ num: 0, logements: 1 }] }];
      ES.etat.alobees.ajout = Object.assign({}, c, { structure: JSON.parse(JSON.stringify(structure)) });
    },
    'reco-annuler': function () { ES.etat.alobees.ajout = null; },
    'reco-logements': function (v) {
      var p = v.split('|').map(Number), n = ES.etat.alobees.ajout.structure[p[0]].niveaux[p[1]];
      n.logements = Math.min(99, Math.max(1, n.logements + p[2]));
    },
    'reco-niveau': function (v) {
      var p = v.split('|').map(Number), niveaux = ES.etat.alobees.ajout.structure[p[0]].niveaux;
      if (p[1] > 0 && niveaux.length < 61) niveaux.push({ num: niveaux.length ? niveaux[niveaux.length - 1].num + 1 : 0, logements: niveaux.length ? niveaux[niveaux.length - 1].logements : 1 });
      else if (p[1] < 0 && niveaux.length > 1) niveaux.pop();
    },
    'reco-batiment': function () {
      var s = ES.etat.alobees.ajout.structure;
      if (s.length >= 30) return;
      s.push({ nom: 'Bât ' + String.fromCharCode(65 + s.length), niveaux: [{ num: 0, logements: 1 }] });
    },
    'reco-confirmer': async function () {
      var c = ES.etat.alobees.ajout;
      var r = await root.Cloud.alobees('ajouter_chantier', { alobees_id: c.alobees_id, structure: c.structure });
      o.toast('✓ ' + c.nom + ' ajouté au Registre' + (r.plans ? ' · ' + o.pluriel(r.plans, 'plan') + ' d\'incorporation copié(s)' : ''));
      ES.etat.alobees.ajout = null;
      await relireRecos();
      if (ES.registre) await ES.registre.charger();
      if (ES.app.rafraichirRegistreFiches) await ES.app.rafraichirRegistreFiches();
    },
    'reco-ignorer': async function (v) {
      await root.Cloud.alobees('ignorer_chantier', { alobees_id: v });
      await relireRecos();
    },
    'reco-retablir': async function (v) {
      await root.Cloud.alobees('retablir_chantier', { alobees_id: v });
      await relireRecos();
    }
  };
  function vueChantiers(a) {
    return '<p class="lead">' + o.pluriel(a.liste.length, 'chantier') + ' trouvés (nom, ville, client, dates). Cochez ceux à ajouter au Registre.</p><div class="list">' +
      a.liste.map(function (c) {
        var texte = h(c.nom) + ' · ' + h(c.ville || '') + (c.deja ? ' <span class="muted">déjà dans le registre</span>' : ' <span class="pill p-envoyee">nouveau</span>');
        return c.deja ? '<div class="pick pick--grise">✓ ' + texte + '</div>' : coche('alobees-coche', c.alobees_id, a.choix.indexOf(c.alobees_id) >= 0, texte);
      }).join('') + '</div><p class="muted">Les plans se récupèrent ensuite chantier par chantier.</p>' + pied('alobees-importer-chantiers', a.choix.length, 'chantier');
  }
  function vueMembres(a) {
    return '<p class="lead">Membres actifs d\'Alobees. Cochez les personnes à ajouter : elles apparaissent sur les fiches ; vous créez leur compte ensuite.</p>' +
      '<div class="field"><div class="field__l">Fonction</div><div class="chips">' + [['compagnon', 'Compagnon'], ['chef_equipe', 'Chef d\'équipe'], ['chef_chantier', 'Chef de chantier']].map(function (f) {
        return '<button class="chip" data-a="alobees-fonction" data-v="' + f[0] + '" aria-pressed="' + (a.fonction === f[0]) + '">' + f[1] + '</button>';
      }).join('') + '</div></div><div class="list">' + a.liste.map(function (m) {
        return m.deja ? '<div class="pick pick--grise">✓ ' + h(m.nom) + ' <span class="muted">déjà dans la liste</span></div>'
          : coche('alobees-coche', m.nom, a.choix.indexOf(m.nom) >= 0, h(m.nom));
      }).join('') + '</div>' + pied('alobees-importer-membres', a.choix.length, 'personne');
  }
  function vuePlans(a) {
    var c = ES.registre.chantierOuvert(), parDossier = {};
    a.liste.forEach(function (f) { (parDossier[f.dossier || 'Racine'] = parDossier[f.dossier || 'Racine'] || []).push(f); });
    var niveaux = [];
    ES.registre.batimentsTries(c).forEach(function (b) { b.niveaux.forEach(function (n) { niveaux.push({ id: n.id, nom: b.nom + ' · ' + o.nivL(n.num) }); }); });
    var out = '<p class="lead">Dossiers Alobees du chantier. L\'appli lit le <b>nom de chaque fichier</b> (sans IA) et propose bâtiment, niveau et indice. Vérifiez, puis enregistrez.</p>' +
      '<div class="pick pick--grise">🔒 Devis, clients, administratif : masqués, jamais affichés dans l\'appli</div>';
    Object.keys(parDossier).forEach(function (dossier) {
      out += '<h5>📁 ' + h(dossier) + '</h5>' + parDossier[dossier].map(function (f) {
        var niveau = a.associations[f.doc_id] || f.niveau_id;
        if (!niveau) {
          return '<div class="pick pick--grise pick--col"><span>📄 ' + h(f.nom) + '</span><span class="muted">? niveau non reconnu : à associer à la main</span>' +
            '<select class="inp" data-saisie="alobees-niveau" data-v="' + h(f.doc_id) + '" aria-label="Niveau pour ' + h(f.nom) + '"><option value="">Associer à un niveau…</option>' +
            niveaux.map(function (n) { return '<option value="' + n.id + '">' + h(n.nom) + '</option>'; }).join('') + '</select></div>';
        }
        var nom = (niveaux.filter(function (n) { return n.id === niveau; })[0] || {}).nom || '';
        var etat = f.a_jour ? ' · déjà à jour' : f.plus_recent ? ' · <b class="txt-ko">nouvel indice (actuel ' + h(f.actuel) + ')</b>' : '';
        return coche('alobees-coche', f.doc_id, a.choix.indexOf(f.doc_id) >= 0,
          '<span class="pick__txt">📄 ' + h(f.nom) + '<span class="pick__sous">→ ' + h(nom) + ' · ind ' + h(f.ind || '?') + etat + '</span></span>');
      }).join('');
    });
    return out + '<p class="muted">Un fichier non reconnu (ex. plan architecte fusionné) peut être associé à la main à un niveau.</p>' + pied('alobees-importer-plans', a.choix.length, 'plan');
  }

  // ------------------------------------------------------------ ouverture et enregistrement
  async function ouvrir(mode, titre, lire) {
    ES.etat.alobees = { mode: mode, titre: titre, lu: false, liste: [], choix: [], associations: {}, fonction: 'compagnon', retour: ES.etat.ecran };
    ES.etat.ecran = { n: 'alobees' };
    ES.app.afficher();
    try {
      ES.etat.alobees.liste = await lire();
      ES.etat.alobees.lu = true;
      if (mode === 'plans') {                      // le meilleur indice de chaque niveau, s'il n'est pas déjà à jour, est pré-coché
        ES.etat.alobees.choix = ES.etat.alobees.liste.filter(function (f) { return f.meilleur && !f.a_jour; }).map(function (f) { return f.doc_id; });
      }
    } catch (e) { o.toast('Alobees : ' + e.message); ES.etat.ecran = ES.etat.alobees.retour; }
  }
  function retour() { ES.etat.ecran = ES.etat.alobees.retour; }

  var ACTIONS = {
    'alobees-chantiers': function () {
      return ouvrir('chantiers', 'Importer des chantiers', async function () { return (await root.Cloud.alobees('chantiers')).chantiers; });
    },
    'alobees-membres': function () {
      return ouvrir('membres', 'Importer des personnes', async function () { return (await root.Cloud.alobees('membres')).membres; });
    },
    'alobees-plans': function () {
      var c = ES.registre.chantierOuvert();
      return ouvrir('plans', c.nom + ' · plans', async function () { return (await root.Cloud.alobees('documents', { chantier_id: c.id })).fichiers; });
    },
    'alobees-retour': retour,
    'alobees-coche': function (v) {
      var a = ES.etat.alobees;
      if (a.mode === 'plans' && a.choix.indexOf(v) < 0) cocherPlan(a, v);
      else a.choix = basculer(a.choix, v);
    },
    'alobees-fonction': function (v) { ES.etat.alobees.fonction = v; },
    'alobees-importer-chantiers': async function () {
      try {
        var r = await root.Cloud.alobees('importer_chantiers', { ids: ES.etat.alobees.choix });
        o.toast(o.pluriel(r.crees, 'chantier') + ' ajouté(s) au Registre');
        retour();
        await ES.registre.charger();
      } catch (e) { o.toast(e.message); }
    },
    'alobees-importer-membres': async function () {
      var a = ES.etat.alobees;
      try {
        for (var i = 0; i < a.choix.length; i++) await root.Cloud.sauverPersonne({ nom: a.choix[i], fonction: a.fonction });
        o.toast(o.pluriel(a.choix.length, 'personne') + ' ajoutée(s)');
        retour();
        await ES.personnes.charger();
      } catch (e) { o.toast(e.message); }
    },
    'alobees-importer-plans': async function () {
      var a = ES.etat.alobees, c = ES.registre.chantierOuvert();
      var choix = a.liste.filter(function (f) { return a.choix.indexOf(f.doc_id) >= 0; }).map(function (f) {
        return { doc_id: f.doc_id, niveau_id: a.associations[f.doc_id] || f.niveau_id, indice: f.ind };
      }).filter(function (x) { return x.niveau_id; });
      try {
        var r = await root.Cloud.alobees('importer_plans', { chantier_id: c.id, choix: choix });
        o.toast(o.pluriel(r.importes, 'plan') + ' copié(s) dans l\'appli');
        retour();
        await ES.registre.chargerPlans(c.id);
        await ES.registre.charger();
      } catch (e) { o.toast(e.message); }
    }
  };
  // association à la main d'un plan non reconnu
  function saisie(el) {
    if (el.dataset.saisie !== 'alobees-niveau') return false;
    var a = ES.etat.alobees;
    if (el.value) { a.associations[el.dataset.v] = el.value; cocherPlan(a, el.dataset.v); }
    ES.app.afficher();
    return true;
  }

  Object.keys(ACTIONS_RECOS).forEach(function (k) { ACTIONS[k] = ACTIONS_RECOS[k]; });
  ES.alobees = { vue: vue, saisie: saisie, ACTIONS: ACTIONS };
})(window);
