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
    var corps = a.mode === 'chantiers' ? vueChantiers(a) : a.mode === 'membres' ? vueMembres(a) : vuePlans(a);
    return { haut: haut('Alobees', a.titre), contenu: BANDEAU + corps, bas: '' };
  }
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

  ES.alobees = { vue: vue, saisie: saisie, ACTIONS: ACTIONS };
})(window);
