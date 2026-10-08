/*
 * Appli V2, lot C : une fiche reçue (ADR-0013).
 * Ouverture (« reçue » pour le conducteur du chantier ou le patron), validation signée,
 * renvoi « à corriger » point par point (système rouge), et « Corriger maintenant » pour l'auteur.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  var STATUTS = {
    soumise: ['Envoyée', 'p-envoyee'], recue: ['Reçue', 'p-envoyee'], validee: ['Validée 🔒', 'p-validee'],
    a_corriger: ['À corriger', 'p-ko'], remplacee: ['Remplacée', 'p-attente']
  };
  function statut(f) { return STATUTS[f.etat] || [f.etat, 'p-attente']; }
  var DOSSIER_ALOBEES = 'Fiches auto-contrôle';       // seul dossier où l'appli écrit dans un chantier Alobees (ou un dossier au nom proche)
  // le serveur vérifie qu'il s'agit bien du conducteur DU chantier ; ici on n'affiche les boutons qu'aux bons profils
  function peutValider() { var r = ES.etat.profil.role; return r === 'admin' || r === 'conducteur'; }
  function aControler(f) { return f.etat === 'soumise' || f.etat === 'recue'; }
  function etapeDuPoint(id) {
    var s = ES.gabarit.sectionsV2().filter(function (x) { return x.points.some(function (p) { return p.id === id; }); })[0];
    return s ? s.etape : 8;
  }

  // ------------------------------------------------------------ consultation d'une fiche
  function vueFiche() {
    var f = ES.etat.ficheOuverte, p = ES.etat.profil;
    var haut = function (sous) {
      return '<div class="top"><button class="top__back" data-a="accueil" aria-label="Retour">‹</button><div class="top__t"><strong>Fiche</strong><span>' + h(sous) + '</span></div></div>';
    };
    if (!f) return { haut: haut(''), contenu: '<p class="empty">Chargement…</p>', bas: '' };
    var c = ES.assistant.chantier(f.chantier_id) || { nom: '' };
    var notes = f.notes || {}, aCorriger = f.points_a_corriger || [];
    var anomalies = ES.gabarit.tousLesPoints().filter(function (pt) { return f.items[pt.id] === 'KO'; });
    var s = statut(f);
    var out = '<div class="pills"><span class="pill ' + s[1] + '">' + s[0] + '</span>' +
      (anomalies.length ? '<span class="pill p-ko">⚠ ' + o.pluriel(anomalies.length, 'anomalie') + '</span>' : '') + '</div>';
    if (f.etat === 'a_corriger') {
      out += '<div class="redbox"><h4>↩ À corriger</h4>' + (aCorriger.length ? '<ul>' + aCorriger.map(function (id) {
        var pt = ES.gabarit.tousLesPoints().filter(function (x) { return x.id === id; })[0];
        return '<li><b>' + h(pt ? pt.label : id) + '</b> · étape ' + etapeDuPoint(id) + '</li>';
      }).join('') + '</ul>' : '') + (f.note_correction ? '<p>« ' + h(f.note_correction) + ' »</p>' : '') +
        (f.created_by === ES.etat.monId ? '<button class="btn btn--big btn--rouge" data-a="corriger-maintenant">Corriger maintenant ›</button>'
          : '<p class="muted">L\'auteur de la fiche doit corriger, puis la renvoyer.</p>') + '</div>';
    }
    out += '<div class="card"><dl class="kv"><dt>Chantier</dt><dd>' + h(c.nom) + '</dd><dt>Emplacement</dt><dd>' + h(ES.assistant.lieu(f)) + '</dd>' +
      '<dt>Incorporation</dt><dd>' + o.frDate(f.date_fiche) + '</dd><dt>Coulage prévu</dt><dd>' + o.frDate(f.coulage) + '</dd>' +
      '<dt>Chef de chantier</dt><dd>' + h(f.chef) + '</dd><dt>Équipe</dt><dd>' + h([f.chef_equipe].concat(f.compagnons || []).filter(Boolean).join(', ')) + '</dd>' +
      '<dt>Rempli par</dt><dd>' + h(f.controleur) + '</dd></dl></div>';
    var plan = (c.plans || []).filter(function (x) { return x.niveau_id === f.niveau_id; })[0];
    if (plan) out += '<button class="btn btn--ghost btn--block" data-a="voir-plan-fiche" data-v="' + plan.id + '">🗺 Plan du niveau' + (plan.indice ? ' (indice ' + h(plan.indice) + ')' : '') + '</button>';
    if (f.plan_indice && plan && plan.indice && f.plan_indice !== plan.indice) {
      out += '<div class="warnbox">⚠ Fiche faite sur le plan <b>indice ' + h(f.plan_indice) + '</b> ; indice actuel : <b>' + h(plan.indice) + '</b>. Vérifiez les modifications.</div>';
    }
    if (ES.programmation) out += ES.programmation.comparaison(f);
    if (anomalies.length) out += '<h3 class="txt-ko">Anomalies signalées</h3><div class="alert alert--liste">' + anomalies.map(function (pt) {
      return '<div><b>✗ ' + h(pt.label) + '</b>' + (notes[pt.id] ? '<br><i>« ' + h(notes[pt.id]) + ' »</i>' : '') + '</div>';
    }).join('') + '</div>';
    out += '<h3>Réponses</h3>' + ES.gabarit.sectionsV2().map(function (sec) {
      var faits = sec.points.filter(function (pt) { return f.items[pt.id] === 'OK'; }).length;
      return '<details class="sec"><summary><span>' + sec.titre + '</span><span>' + faits + '/' + sec.points.length + ' ✓</span></summary><ul>' +
        sec.points.map(function (pt) {
          return '<li>' + (f.items[pt.id] === 'KO' ? '<span class="txt-ko">✗</span> ' : '<span class="txt-ok">✓</span> ') + h(pt.label) +
            (aCorriger.indexOf(pt.id) >= 0 ? ' <b class="txt-ko">↩ à corriger</b>' : '') + '</li>';
        }).join('') + '</ul></details>';
    }).join('');
    if (f.observations) out += '<h3>Observations</h3><div class="card">' + h(f.observations) + '</div>';
    if (f.signature) {
      out += '<h3>Signatures</h3><div class="card"><img class="sign-img" src="' + h(f.signature) + '" alt="Signature de l\'auteur"><span class="muted">Rempli par ' + h(f.controleur) + '</span>' +
        (f.signature_validation ? '<img class="sign-img sign-img--2" src="' + h(f.signature_validation) + '" alt="Signature du valideur"><span class="muted">Validée le ' + o.frDate((f.validee_le || '').slice(0, 10)) + '</span>' : '') + '</div>';
    }
    var actions = '';
    if (f.etat === 'validee') {
      actions = '<div class="lock">🔒 Validée et verrouillée : plus modifiable.</div>' +
        (peutValider() ? '<button class="btn btn--ghost btn--block" data-a="mail-factu">✉ Envoyer l\'Excel à la facturation</button>' + blocAlobees(f) : '');
    }
    else if (aControler(f) && peutValider()) {
      actions = '<button class="btn btn--ok btn--big" data-a="valider">✓ Valider la fiche</button>' +
        '<button class="btn btn--ko btn--block" data-a="renvoyer">↩ Renvoyer à corriger</button>' +
        (p.role === 'admin' ? '<p class="muted centre">Normalement validée par le conducteur. Possible ici s\'il est absent.</p>' : '');
    } else if (aControler(f) && p.role === 'chef_chantier') {
      actions = '<div class="info">Consultation seule : la validation est faite par le conducteur de travaux.</div>';
    }
    if (peutRetirer(f)) actions += '<button class="btn btn--ghost btn--block txt-ko" data-a="fiche-retirer">🗑 Retirer la fiche</button>';
    if (actions) out += '<div class="actions">' + actions + '</div>';
    return { haut: haut(c.nom), contenu: out, bas: '' };
  }

  // Excel dans Alobees (<chantier> › « Fiches auto-contrôle ») : état du dépôt, ou bouton pour le faire
  function chantierRelie(f) { var c = ES.assistant.chantier(f.chantier_id); return !!(c && c.alobees); }
  function blocAlobees(f) {
    if (!chantierRelie(f)) return '';
    var d = f.depotAlobees;
    if (d && d.alobees_doc_id) return '<p class="muted centre">📁 Excel déposé dans Alobees › ' + DOSSIER_ALOBEES + ' le ' + o.frDate((d.depose_le || '').slice(0, 10)) + '</p>';
    return '<button class="btn btn--ghost btn--block" data-a="depot-alobees">📁 Déposer l\'Excel dans Alobees</button>' +
      (d && d.erreur ? '<p class="muted centre">Alobees n\'a pas répondu au dernier essai : nouvel essai automatique cette nuit.</p>' : '');
  }

  // retirer une fiche envoyée par erreur : l'auteur, le conducteur du chantier ou le patron, tant qu'elle n'est pas validée
  function peutRetirer(f) {
    if (f.etat === 'validee' || f.etat === 'remplacee') return false;
    var p = ES.etat.profil, c = ES.assistant.chantier(f.chantier_id) || {};
    return f.created_by === ES.etat.monId || p.role === 'admin' || (p.role === 'conducteur' && c.conducteur_id === ES.etat.monId);
  }
  function feuilleRetirer() {
    var f = ES.etat.ficheOuverte;
    return '<div class="sheet__h"><strong>Retirer cette fiche ?</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<p>La fiche <b>' + h(ES.assistant.lieu(f)) + '</b> est supprimée. Le patron, le conducteur et l\'auteur sont prévenus avec le motif ; la trace du retrait est gardée.</p>' +
      '<h5>Motif <small class="muted">obligatoire</small></h5>' +
      '<textarea rows="2" maxlength="500" data-saisie-feuille="motif" aria-label="Motif du retrait" placeholder="Ex. fiche en double, mauvais niveau">' + h(ES.etat.feuille.motif || '') + '</textarea>' +
      '<div class="foot__row foot__row--marge"><button class="btn btn--ghost" data-a="fermer-feuille">Annuler</button>' +
      '<button class="btn btn--ko" data-a="retirer-ok"' + ((ES.etat.feuille.motif || '').trim().length >= 3 ? '' : ' disabled') + '>🗑 Retirer</button></div>';
  }

  // ------------------------------------------------------------ feuilles : valider (signée) et renvoyer
  function feuilleValider() {
    var f = ES.etat.ficheOuverte, sig = ES.etat.feuille.signature;
    return '<div class="sheet__h"><strong>Valider la fiche ?</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      (ES.etat.profil.role === 'admin' ? '<div class="info">Vous validez <b>à la place du conducteur absent</b>. Votre nom apparaîtra comme valideur.</div>' : '') +
      '<p>La fiche sera <b>verrouillée</b> : plus aucune modification possible.</p>' +
      (f.ko ? '<div class="alert">⚠ Cette fiche a une anomalie : elle ne peut pas être validée. Renvoyez-la à corriger.</div>' : '') +
      '<label class="check check--petit"><input type="checkbox" data-a="excel-validation"' + (ES.etat.feuille.excel ? ' checked' : '') + '>' +
      '<span>Envoyer l\'Excel à la facturation<small>' + (f.excel_demande ? 'Demandé par ' + h(f.controleur) + ' à l\'envoi' : 'Non demandé à l\'envoi') +
      ' · pièce jointe</small></span></label>' +
      (chantierRelie(f) ? '<label class="check check--petit"><input type="checkbox" data-a="alobees-validation"' + (ES.etat.feuille.alobees ? ' checked' : '') + '>' +
        '<span>Déposer l\'Excel dans Alobees<small>' + h((ES.assistant.chantier(f.chantier_id) || {}).nom || '') + ' › ' + DOSSIER_ALOBEES + '</small></span></label>' : '') +
      '<div class="field"><div class="field__l">Signature du conducteur <small>avec le doigt</small></div>' +
      '<div class="sign"><canvas data-signature-validation aria-label="Zone de signature du valideur"></canvas>' + (sig ? '' : '<span class="sign__ph">Signez ici</span>') + '</div>' +
      '<div class="sign__pied"><span class="muted">' + h(ES.etat.profil.nom) + '</span>' + (sig ? '<button class="link" data-a="effacer-signature-validation">Effacer</button>' : '') + '</div></div>' +
      '<div class="foot__row"><button class="btn btn--ghost" data-a="fermer-feuille">Annuler</button>' +
      '<button class="btn btn--ok" data-a="valider-ok"' + (sig && !f.ko ? '' : ' disabled') + '>✓ Valider</button></div>';
  }
  function feuilleRenvoyer() {
    var choisis = ES.etat.feuille.points, f = ES.etat.ficheOuverte;
    return '<div class="sheet__h"><strong>Renvoyer à corriger</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<p class="muted">Touchez les points à reprendre : ils reviennent <b class="txt-ko">en rouge</b> chez l\'auteur, qui est emmené directement dessus.</p>' +
      ES.gabarit.sectionsV2().map(function (sec) {
        return '<h5>' + sec.etape + '. ' + sec.titre + '</h5>' + sec.points.map(function (pt) {
          var pris = choisis.indexOf(pt.id) >= 0;
          return '<button class="pick" data-a="point-a-corriger" data-v="' + pt.id + '" aria-pressed="' + pris + '">' + (pris ? '↩' : '○') + ' ' + h(pt.label) +
            (f.items[pt.id] === 'KO' ? ' <span class="pill p-ko">anomalie signalée</span>' : '') + '</button>';
        }).join('');
      }).join('') +
      '<h5>Précision pour l\'équipe <small class="muted">facultatif</small></h5>' +
      '<textarea rows="2" maxlength="1000" data-saisie-feuille="note" aria-label="Précision pour l\'équipe (facultatif)" placeholder="Ex. reprendre la nourrice du 012">' + h(ES.etat.feuille.note || '') + '</textarea>' +
      '<div class="foot__row foot__row--marge"><button class="btn btn--ghost" data-a="fermer-feuille">Annuler</button>' +
      '<button class="btn btn--ko" data-a="renvoyer-ok"' + (choisis.length || (ES.etat.feuille.note || '').trim() ? '' : ' disabled') + '>↩ Renvoyer (' + o.pluriel(choisis.length, 'point') + ')</button></div>';
  }
  function apresAffichage(racine) {
    var toile = racine.querySelector('canvas[data-signature-validation]');
    if (!toile) return;
    ES.signature.brancher(toile, ES.etat.feuille.signature, function (image) {
      ES.etat.feuille.signature = image;
      ES.app.afficher();
    });
  }

  // ------------------------------------------------------------ Excel de la fiche validée : facturation (mail) et Alobees
  // l'Excel est fabriqué sur le téléphone puis déposé dans le stockage privé ; le serveur fait le reste
  async function preparerExcel(f) {
    await ES.gabarit.charger();
    await root.Cloud.preparerExcel(f, await ES.assistant.genererExcel(ES.assistant.ficheExcelDepuisServeur(f)));
  }
  async function envoyerExcelFacturation(f) {
    var r = await root.Cloud.envoyerExcel(f);
    o.toast('✉ Excel envoyé à ' + r.destinataire);
  }
  async function deposerDansAlobees(f) {
    var r = await root.Cloud.deposerExcelAlobees(f);
    o.toast(r.deja ? 'L\'Excel est déjà dans Alobees' : '📁 Excel déposé dans Alobees › ' + DOSSIER_ALOBEES);
    f.depotAlobees = await root.Cloud.depotAlobees(f.id);
  }

  // ------------------------------------------------------------ « Corriger maintenant » : la fiche revient en brouillon
  function brouillonDeCorrection(f) {
    var aCorriger = f.points_a_corriger || [];
    var items = Object.assign({}, f.items);
    aCorriger.forEach(function (id) { delete items[id]; });          // les points en rouge sont à re-répondre
    var b = ES.brouillon.nouveau(ES.etat.profil);
    return Object.assign(b, {
      id: f.id, serverVersion: f.version, chantier_id: f.chantier_id, batiment_id: f.batiment_id, niveau_id: f.niveau_id,
      logements: f.logements.slice(), date: f.date_fiche, coulage: f.coulage, chef: f.chef, chef_equipe: f.chef_equipe,
      compagnons: (f.compagnons || []).slice(), items: items, notes: Object.assign({}, f.notes || {}), observations: f.observations || '',
      excel_demande: !!f.excel_demande,
      plan_indice: f.plan_indice, aCorriger: aCorriger.slice(), noteCorrection: f.note_correction, correctionDe: f.id,
      etape: aCorriger.length ? etapeDuPoint(aCorriger[0]) : 8, vues: 8
    });
  }

  var ACTIONS = {
    'ouvrir': async function (v) {
      ES.etat.feuille = null;                          // ouverte depuis une feuille (coulage, logement) : la feuille se ferme
      ES.etat.ecran = { n: 'fiche', id: v };
      ES.etat.ficheOuverte = null;
      ES.app.afficher();
      try {
        await root.Cloud.marquerVue(v);                 // badge éteint ; « reçue » pour le conducteur
        ES.etat.ficheOuverte = await root.Cloud.fiche(v);
        if (ES.etat.ficheOuverte.etat === 'validee' && peutValider()) ES.etat.ficheOuverte.depotAlobees = await root.Cloud.depotAlobees(v);
        ES.etat.vues = (ES.etat.vues || []).concat([v]);
      } catch (e) { o.toast(e.message); ES.etat.ecran = { n: 'accueil' }; }
    },
    'voir-plan-fiche': function (v) {
      var c = ES.assistant.chantier(ES.etat.ficheOuverte.chantier_id) || { plans: [] };
      var plan = c.plans.filter(function (p) { return p.id === v; })[0];
      return o.ouvrirOnglet(root.Cloud.urlPlan(plan));
    },
    'valider': function () {
      ES.etat.feuille = { type: 'valider', signature: null, excel: !!ES.etat.ficheOuverte.excel_demande, alobees: chantierRelie(ES.etat.ficheOuverte) };
    },
    'alobees-validation': function (v, ev) { ES.etat.feuille.alobees = ev.target.checked; },
    'effacer-signature-validation': function () { ES.etat.feuille.signature = null; },
    'excel-validation': function (v, ev) { ES.etat.feuille.excel = ev.target.checked; },
    'valider-ok': async function () {
      var signature = ES.etat.feuille.signature, envoyerExcel = ES.etat.feuille.excel, versAlobees = ES.etat.feuille.alobees, id = ES.etat.ficheOuverte.id;
      ES.etat.feuille = null;
      try { ES.etat.ficheOuverte = await root.Cloud.validerFiche(id, signature); }
      catch (e) { o.toast(e.message); return; }
      o.toast('Fiche validée et verrouillée');
      root.Cloud.evenementFiche(id, 'validee');                 // l'auteur et l'équipe sont prévenus
      if (!envoyerExcel && !versAlobees) return;
      var f = ES.etat.ficheOuverte;
      try { await preparerExcel(f); }
      catch (e) { o.toast('Fiche validée, mais Excel non préparé (' + e.message + '). Réessayez avec les boutons de la fiche.'); return; }
      if (envoyerExcel) {
        try { await envoyerExcelFacturation(f); }
        catch (e) { o.toast('Fiche validée, mais Excel non envoyé (' + e.message + '). Réessayez avec « Envoyer l\'Excel ».'); }
      }
      if (versAlobees) {
        try { await deposerDansAlobees(f); }
        catch (e) { o.toast('Fiche validée, mais Excel pas encore dans Alobees (' + e.message + ').'); f.depotAlobees = await root.Cloud.depotAlobees(f.id); }
      }
    },
    'mail-factu': async function () {
      try { await preparerExcel(ES.etat.ficheOuverte); await envoyerExcelFacturation(ES.etat.ficheOuverte); }
      catch (e) { o.toast('Excel non envoyé : ' + e.message); }
    },
    'depot-alobees': async function () {
      var f = ES.etat.ficheOuverte;
      try { await preparerExcel(f); await deposerDansAlobees(f); }
      catch (e) { o.toast('Excel pas déposé dans Alobees : ' + e.message); f.depotAlobees = await root.Cloud.depotAlobees(f.id); }
    },
    'fiche-retirer': function () { ES.etat.feuille = { type: 'retirer-fiche', motif: '' }; },
    'retirer-ok': async function () {
      var motif = (ES.etat.feuille.motif || '').trim(), id = ES.etat.ficheOuverte.id;
      ES.etat.feuille = null;
      await root.Cloud.retirerFiche(id, motif);
      o.toast('Fiche retirée');
      ES.etat.ficheOuverte = null;
      ES.etat.ecran = { n: 'accueil' };
      await ES.app.rafraichirListe();
    },
    'renvoyer': function () {
      var f = ES.etat.ficheOuverte;
      var anomalies = Object.keys(f.items).filter(function (id) { return f.items[id] === 'KO'; });
      ES.etat.feuille = { type: 'renvoyer', points: anomalies, note: '' };   // les anomalies signalées sont déjà cochées
    },
    'point-a-corriger': function (v) {
      var liste = ES.etat.feuille.points;
      ES.etat.feuille.points = liste.indexOf(v) >= 0 ? liste.filter(function (x) { return x !== v; }) : liste.concat([v]);
    },
    'renvoyer-ok': async function () {
      try {
        ES.etat.ficheOuverte = await root.Cloud.renvoyerACorriger(ES.etat.ficheOuverte.id, ES.etat.feuille.points, ES.etat.feuille.note);
        o.toast('Fiche renvoyée à son auteur');
        root.Cloud.evenementFiche(ES.etat.ficheOuverte.id, 'a_corriger');   // l'auteur et l'équipe sont prévenus
      } catch (e) { o.toast(e.message); }
      ES.etat.feuille = null;
    },
    'corriger-maintenant': async function () {
      if (!(await ES.brouillon.remplacerAvecAccord())) return;
      ES.etat.brouillon = brouillonDeCorrection(ES.etat.ficheOuverte);
      ES.brouillon.sauver(ES.etat.brouillon);
      ES.etat.photos = [];
      if (ES.assistant.chargerMemoire) await ES.assistant.chargerMemoire(ES.etat.brouillon.chantier_id);
      ES.etat.ecran = { n: 'assistant' };
    }
  };

  ES.reception = { vueFiche: vueFiche, feuilleValider: feuilleValider, feuilleRenvoyer: feuilleRenvoyer, feuilleRetirer: feuilleRetirer, apresAffichage: apresAffichage,
    ACTIONS: ACTIONS, statut: statut, aControler: aControler, peutValider: peutValider };
})(window);
