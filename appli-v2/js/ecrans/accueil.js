/*
 * Appli V2 : accueil « Incorporation ».
 *  - créateurs (chef, conducteur, patron) : nouvelle fiche, « Mes fiches » / « Reçues » (badge des nouvelles)
 *  - compagnon : fiches de son équipe ; facturation : fiches validées
 *  - fiches de l'auteur à corriger : encadré rouge en tête
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  function barreHaut(titre, sousTitre) {
    var p = ES.etat.profil;
    return '<div class="top"><img class="top__logo" src="icons/logo.png" alt="Euro Sanichauff">' +
      '<div class="top__t"><strong>' + h(titre) + '</strong><span>' + h(sousTitre) + '</span></div>' +
      '<button class="avatar" data-a="compte" aria-label="Mon compte : ' + h(p.nom) + '">' + o.initiales(p.nom) + '</button></div>';
  }
  function etatReseau() {
    var attente = (ES.etat.outbox || []).filter(function (e) { return !e.recue; }).length;
    if (ES.etat.sessionExpiree) {
      return '<div class="bandeau bandeau--off">🔒 Session expirée : reconnectez-vous pour envoyer vos fiches (rien n\'est perdu). ' +
        '<button class="link" data-a="reconnecter">Se reconnecter</button></div>';
    }
    if (!navigator.onLine) return '<div class="bandeau bandeau--off">✈ Hors réseau : les fiches partiront toutes seules au retour du réseau' + (attente ? ' (' + attente + ' en attente)' : '') + '</div>';
    if (attente) return '<div class="bandeau">🔄 ' + o.pluriel(attente, 'fiche') + ' en attente d\'envoi <button class="link" data-a="envoyer-maintenant">Envoyer maintenant</button></div>';
    return '';
  }
  function ligne(fiche, statut, classe, ouvrable, detail, nouvelle) {
    var c = ES.assistant.chantier(fiche.chantier_id) || { nom: 'Chantier' };
    var ko = fiche.ko || 0;
    var corps = (nouvelle ? '<span class="point-nouveau" aria-hidden="true"></span><span class="sr-only">Nouvelle. </span>' : '') +
      '<div class="row-btn__main"><strong>' + h(c.nom) + '</strong><span>' + h(ES.assistant.lieu(fiche)) + '</span>' +
      '<span>' + h(detail) + '</span><span class="pills"><span class="pill ' + classe + '">' + h(statut) + '</span>' +
      (ko ? '<span class="pill p-ko">⚠ ' + o.pluriel(ko, 'anomalie') + '</span>' : '') + '</span></div>';
    if (ouvrable) return '<button class="row-btn" data-a="ouvrir" data-v="' + fiche.id + '">' + corps + '<span class="chev" aria-hidden="true">›</span></button>';
    // fiche refusée par le serveur (erreur définitive) : on peut la retirer du téléphone
    return '<div class="row-btn">' + corps + (classe === 'p-ko' ? '<button class="btn btn--sm btn--ko" data-a="outbox-retirer" data-v="' + fiche.id + '">Supprimer</button>' : '') + '</div>';
  }
  function ligneServeur(f, montrerAuteur) {
    var s = ES.reception.statut(f);
    var nouvelle = ES.reception.aControler(f) && (ES.etat.vues || []).indexOf(f.id) < 0 && f.created_by !== ES.etat.monId;
    return ligne(f, s[0], s[1], true, 'coulage ' + o.frDate(f.coulage) + (montrerAuteur ? ' · chef ' + (f.chef || '?') : ''), nouvelle);
  }
  // fiches reçues : celles des autres (le serveur ne renvoie que ce que le profil a le droit de voir)
  function recues() { return (ES.etat.fiches || []).filter(function (f) { return f.created_by !== ES.etat.monId; }); }
  function badge() {
    return recues().filter(function (f) { return ES.reception.aControler(f) && (ES.etat.vues || []).indexOf(f.id) < 0; }).length;
  }

  function vue() {
    var p = ES.etat.profil, createur = o.peutCreer(p.role);
    var out = etatReseau() + ES.notifications.aideIphone();
    var aCorriger = (ES.etat.fiches || []).filter(function (f) { return f.etat === 'a_corriger' && f.created_by === ES.etat.monId; });
    if (aCorriger.length) {
      out += '<div class="redbox"><h4>↩ ' + o.pluriel(aCorriger.length, 'fiche') + ' à corriger</h4>' + aCorriger.map(function (f) {
        var c = ES.assistant.chantier(f.chantier_id) || { nom: '' };
        return '<button class="btn btn--block btn--rouge" data-a="ouvrir" data-v="' + f.id + '">' + h(c.nom) + ' · ' + h(ES.assistant.lieu(f)) + ' ›</button>';
      }).join('') + '</div>';
    }
    if (createur) {
      var b = ES.etat.brouillon;
      out += b ? '<button class="btn btn--gold btn--big" data-a="reprendre">▶ Reprendre ' + (b.correctionDe ? 'la correction en cours' : 'ma fiche en cours') + '</button>' +
          '<p class="muted centre">Brouillon : étape ' + b.etape + '/8 · gardé sur le téléphone</p>' +
          '<button class="link centre-bloc" data-a="abandonner">Abandonner ce brouillon</button>'
        : '<button class="btn btn--gold btn--big" data-a="nouvelle">＋ Nouvelle fiche d\'incorporation</button>';
    }
    if (ES.programmation) out += ES.programmation.section();

    var lignes = [];
    if (createur) {
      var n = badge(), onglet = ES.etat.onglet || 'mes';
      out += '<div class="segment" role="group" aria-label="Fiches affichées"><button data-a="onglet" data-v="mes" aria-pressed="' + (onglet === 'mes') + '">Mes fiches</button>' +
        '<button data-a="onglet" data-v="recues" aria-pressed="' + (onglet === 'recues') + '">Reçues' + (n ? ' <span class="badge">' + n + '</span>' : '') + '</button></div>';
      if (onglet === 'mes') {
        (ES.etat.outbox || []).filter(function (e) { return !e.recue; }).forEach(function (e) {
          var f = e.fiche;
          lignes.push(ligne({ id: f.id, chantier_id: f.chantier_id, batiment_id: f.batiment_id, niveau_id: f.niveau_id, logements: f.logements,
            ko: Object.keys(f.items || {}).filter(function (k) { return f.items[k] === 'KO'; }).length },
            e.erreur ? 'Erreur : ' + e.erreur : 'En attente de réseau', e.erreur ? 'p-ko' : 'p-attente', false, 'coulage ' + o.frDate(f.coulage), false));
        });
        (ES.etat.fiches || []).filter(function (f) { return f.created_by === ES.etat.monId; }).forEach(function (f) { lignes.push(ligneServeur(f, false)); });
      } else {
        var liste = recues();
        var aVoir = liste.filter(ES.reception.aControler), autres = liste.filter(function (f) { return !ES.reception.aControler(f); });
        if (aVoir.length) lignes.push('<h3>À contrôler (' + aVoir.length + ')</h3>');
        aVoir.forEach(function (f) { lignes.push(ligneServeur(f, true)); });
        if (autres.length) lignes.push('<h3>Autres fiches</h3>');
        autres.forEach(function (f) { lignes.push(ligneServeur(f, true)); });
      }
    } else {
      out += '<h3>' + (p.role === 'facturation' ? 'Fiches validées' : 'Fiches de mon équipe') + '</h3>';
      if (p.role === 'compagnon') out += '<p class="lead">Vous recevez les fiches où le chef vous a mis dans l\'équipe, avec le plan. Seul le chef de chantier crée les fiches.</p>';
      (ES.etat.fiches || []).forEach(function (f) { lignes.push(ligneServeur(f, true)); });
    }
    out += lignes.length ? '<div class="list">' + lignes.join('') + '</div>' : '<p class="empty">Aucune fiche pour l\'instant.</p>';
    return { haut: barreHaut('Incorporation', p.nom + ' · ' + (o.ROLES[p.role] || p.role)), contenu: out, bas: ES.onglets.barre('inc') };
  }

  function vueEnvoyee(id) {
    var e = (ES.etat.outbox || []).filter(function (x) { return x.id === id; })[0];
    var recue = !e || e.recue;
    var contenu = '<div class="envoyee"><div class="envoyee__icone">' + (recue ? '✅' : '📵') + '</div>' +
      '<h2>' + (recue ? 'Fiche envoyée au bureau' : 'Fiche prête, en attente de réseau') + '</h2>' +
      '<p class="lead">' + (recue ? 'Le conducteur et la direction la reçoivent. Vous la retrouvez dans « Mes fiches ».'
        : 'Elle est gardée sur le téléphone et partira toute seule dès que le réseau revient.') + '</p></div>' +
      '<button class="btn btn--primary btn--block" data-a="accueil">Retour à mes fiches</button>';
    return { haut: barreHaut('Fiche envoyée', ES.etat.profil.nom), contenu: contenu, bas: '' };
  }

  function feuilleCompte() {
    var p = ES.etat.profil, attente = (ES.etat.outbox || []).filter(function (e) { return !e.recue; }).length;
    return '<div class="sheet__h"><strong>' + h(p.nom) + '</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<p class="muted">' + h(o.ROLES[p.role] || p.role) + '</p>' +
      ES.notifications.blocCompte(ES.etat.feuille.notifications || 'inactives') +
      ES.conditions.boutonCompte() +
      (attente ? '<p class="alert">⚠ ' + o.pluriel(attente, 'fiche') + ' pas encore envoyée(s) : elles seront perdues si vous vous déconnectez.</p>' : '') +
      '<button class="btn btn--ghost btn--block foot__row--marge" data-a="deconnexion">Se déconnecter</button>';
  }

  var ACTIONS = {
    'accueil': async function () { ES.etat.ecran = { n: 'accueil' }; ES.etat.ficheOuverte = null; await ES.app.rafraichirListe(); },
    'onglet': function (v) { ES.etat.onglet = v; },
    'nouvelle': async function () {
      ES.etat.brouillon = ES.brouillon.nouveau(ES.etat.profil);
      ES.brouillon.sauver(ES.etat.brouillon);
      ES.etat.photos = [];
      ES.etat.memoire = [];
      ES.etat.ecran = { n: 'assistant' };
    },
    'reprendre': async function () {
      ES.etat.photos = await ES.photos.liste(ES.etat.brouillon.id);
      await ES.assistant.chargerMemoire(ES.etat.brouillon.chantier_id);
      ES.etat.ecran = { n: 'assistant' };
    },
    'abandonner': async function () {
      if (!root.confirm('Abandonner ce brouillon ? Les réponses et les photos seront effacées.')) return;
      await root.Cloud.supprimerPhotos(ES.etat.brouillon.id);
      ES.brouillon.effacer();
      ES.etat.brouillon = null;
      o.toast('Brouillon abandonné');
    },
    'envoyer-maintenant': function () { ES.app.synchroniser(); },
    'outbox-retirer': async function (v) {
      if (!root.confirm('Supprimer cette fiche du téléphone ? Elle n\'a pas été reçue par le bureau et sera perdue.')) return;
      await root.Cloud.retirer(v);
      await root.Cloud.supprimerPhotos(v);
      await ES.app.rafraichirListe();
      o.toast('Fiche supprimée du téléphone');
    },
    'compte': async function () { ES.etat.feuille = { type: 'compte', notifications: await ES.notifications.etat() }; },
    'deconnexion': async function () {
      await root.Cloud.deconnexion();
      ES.etat = { ecran: { n: 'connexion' }, photos: [] };
    }
  };

  ES.accueil = { vue: vue, vueEnvoyee: vueEnvoyee, feuilleCompte: feuilleCompte, ACTIONS: ACTIONS, badge: badge };
})(window);
