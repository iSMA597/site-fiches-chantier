/*
 * Appli V2 : conditions d'utilisation (demande d'Ismael du 08/10).
 * À la première ouverture (et à chaque nouvelle version), l'appli reste sur cet écran tant que la personne
 * n'a pas coché « J'ai lu et j'accepte » et signé au doigt. Le serveur fabrique le PDF signé,
 * le garde et en dépose la copie dans Alobees. Le texte vient du serveur (une seule source).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  function cgu() { return ES.etat.cgu || {}; }

  // à l'ouverture de la session : faut-il signer ? (hors réseau : on ne bloque pas, on redemandera)
  async function aSigner() {
    try {
      var etat = await root.Cloud.conditions('etat');
      if (etat.signee) { ES.etat.cguSigneeLe = etat.signee_le; return false; }
      ES.etat.cgu = { texte: await root.Cloud.conditions('texte'), coche: false, signature: null };
      return true;
    } catch (e) { return false; }
  }

  function article(a) {
    return '<h3>' + h(a.titre) + '</h3>' + a.paragraphes.map(function (p) { return '<p>' + h(p) + '</p>'; }).join('');
  }
  function vue() {
    var c = cgu(), t = c.texte || { articles: [] }, pret = c.coche && c.signature;
    var contenu = '<p class="lead">Avant d\'utiliser l\'application, lisez les conditions ci-dessous, cochez la case puis signez avec le doigt. ' +
      'Une copie signée est gardée par l\'entreprise.</p>' +
      '<div class="card cgu" tabindex="0" aria-label="Texte des conditions d\'utilisation"><h2>' + h(t.titre || '') + '</h2>' +
      '<p class="muted">Version ' + h(t.version || '') + ' du ' + o.frDate(t.date) + '</p>' + t.articles.map(article).join('') + '</div>' +
      '<label class="check"><input type="checkbox" data-a="cgu-coche"' + (c.coche ? ' checked' : '') + '>' +
      '<span>J\'ai lu et j\'accepte les conditions d\'utilisation</span></label>' +
      '<div class="field"><div class="field__l">Signature <small>avec le doigt</small></div>' +
      '<div class="sign"><canvas data-signature-cgu aria-label="Zone de signature"></canvas>' + (c.signature ? '' : '<span class="sign__ph">Signez ici</span>') + '</div>' +
      '<div class="sign__pied"><span class="muted">' + h(ES.etat.profil ? ES.etat.profil.nom : '') + '</span>' +
      (c.signature ? '<button class="link" data-a="cgu-effacer">Effacer</button>' : '') + '</div></div>' +
      '<button class="btn btn--primary btn--big" data-a="cgu-accepter"' + (pret ? '' : ' disabled') + '>J\'accepte et je signe</button>' +
      '<button class="link centre-bloc" data-a="deconnexion">Refuser et se déconnecter</button>';
    return {
      haut: '<div class="top"><div class="top__t"><strong>Conditions d\'utilisation</strong><span>Fiches chantier · Euro Sanichauff</span></div></div>',
      contenu: contenu, bas: ''
    };
  }
  function apresAffichage(racine) {
    var toile = racine.querySelector('canvas[data-signature-cgu]');
    if (!toile) return;
    ES.signature.brancher(toile, cgu().signature, function (image) {
      ES.etat.cgu.signature = /^data:image\/png;base64,./.test(image) ? image : null;     // zone vide : pas de signature
      ES.app.afficher();
    });
  }

  // lien de lecture (5 minutes) vers le PDF signé de la personne connectée, depuis « Mon compte »
  function boutonCompte() {
    if (!ES.etat.cguSigneeLe) return '';
    return '<button class="btn btn--ghost btn--block" data-a="cgu-mon-pdf">📄 Conditions d\'utilisation · signées le ' +
      o.frDate(String(ES.etat.cguSigneeLe).slice(0, 10)) + '</button>';
  }

  var ACTIONS = {
    'cgu-coche': function (v, ev) { ES.etat.cgu.coche = ev.target.checked; },
    'cgu-effacer': function () { ES.etat.cgu.signature = null; },
    'cgu-accepter': async function () {
      var c = cgu();
      if (!c.coche || !c.signature) return;
      var r = await root.Cloud.conditions('accepter', { version: c.texte.version, signature: c.signature });
      o.toast(r.deja ? 'Conditions déjà signées' : '✓ Conditions acceptées et signées');
      ES.etat.cgu = null;
      await ES.app.chargerSession();
    },
    'cgu-mon-pdf': function () { return o.ouvrirOnglet(root.Cloud.monPdfConditions()); }
  };

  ES.conditions = { aSigner: aSigner, vue: vue, apresAffichage: apresAffichage, boutonCompte: boutonCompte, ACTIONS: ACTIONS };
})(window);
