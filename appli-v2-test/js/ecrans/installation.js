/*
 * Appli V2 : installer l'appli sur le téléphone depuis le lien reçu (WhatsApp, SMS…), demande d'Ismael du 08/10.
 *  - Android : bouton « Installer » → fenêtre d'installation du téléphone (2 appuis). Ouvert dans WhatsApp ou un autre
 *    navigateur intégré : bouton « Ouvrir dans Chrome » d'abord.
 *  - iPhone : Apple n'autorise pas l'installation automatique → 3 étapes illustrées (Safari, Partager, Sur l'écran d'accueil).
 *  - Le code d'activation du lien (?code=…) est gardé 48 h sur le téléphone : l'appli installée le retrouve (Android)
 *    ou l'affiche en gros pour le retaper (iPhone, où l'appli installée a sa propre mémoire).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;
  var ua = root.navigator.userAgent || '';
  var invite = null;                                 // fenêtre d'installation proposée par Android (Chrome, Edge, Samsung)

  root.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    invite = e;
    if (ES.app) ES.app.afficher();
  });
  root.addEventListener('appinstalled', function () {
    invite = null;
    o.toast('📲 Appli installée : ouvrez-la depuis l\'écran d\'accueil');
  });

  function installee() {
    return (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || root.navigator.standalone === true;
  }
  function iphone() { return /iPhone|iPad|iPod/.test(ua) || (root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1); }
  function android() { return /Android/.test(ua); }
  function horsSafari() { return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|WhatsApp|Snapchat|Line\//.test(ua); }
  function aProposer() { return (iphone() || android()) && !installee(); }

  // ------------------------------------------------------------ code d'activation reçu par le lien
  function cleCode() { return (root.ES_CONFIG && root.ES_CONFIG.prefixe || 'es2_') + 'code_attente'; }
  function garderCode(code) {
    try { root.localStorage.setItem(cleCode(), JSON.stringify({ code: code, jusqua: Date.now() + 48 * 3600 * 1000 })); } catch (e) { /* mémoire indisponible */ }
  }
  function codeGarde() {
    try {
      var g = JSON.parse(root.localStorage.getItem(cleCode()) || 'null');
      return g && g.jusqua > Date.now() && /^\d{6}$/.test(g.code) ? g.code : null;
    } catch (e) { return null; }
  }
  function oublierCode() { try { root.localStorage.removeItem(cleCode()); } catch (e) { /* rien */ } }

  // ------------------------------------------------------------ bandeau (écran de connexion) et bouton (Mon compte)
  function bandeau() {
    if (!aProposer()) return '';
    return '<button class="installer" data-a="installer"><span aria-hidden="true">📲</span><span><b>Installer l\'appli sur ce téléphone</b>' +
      '<small>' + (iphone() ? '3 appuis, sans App Store' : '2 appuis, sans Play Store') + '</small></span></button>';
  }
  function boutonCompte() {
    return aProposer() ? '<button class="btn btn--ghost btn--block" data-a="installer">📲 Installer l\'appli sur ce téléphone</button>' : '';
  }

  // ------------------------------------------------------------ feuille d'aide
  var ICONE_PARTAGER = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICONE_AJOUTER = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function adresse() { return location.origin + location.pathname; }
  function blocCode() {
    var code = ES.etat.codePrerempli || codeGarde();
    if (!code) return '';
    return '<div class="info">Votre code d\'activation : <b class="code-inline">' + code.slice(0, 3) + ' ' + code.slice(3) + '</b><br>' +
      (iphone() ? 'Notez-le : l\'appli installée vous le demandera.' : 'L\'appli installée le remplira toute seule.') + '</div>';
  }
  function etapesIphone() {
    return '<ol class="etapes-install">' +
      '<li><b>Ouvrir dans Safari</b>' + (horsSafari() ? ' (vous êtes dans une autre appli)' : '') + '<br>' +
      '<span class="muted">Dans WhatsApp : touchez ⋯ ou l\'icône de boussole, puis « Ouvrir dans Safari ».</span>' +
      '<div class="foot__row"><a class="btn btn--ghost" href="x-safari-' + h(adresse()) + '">Ouvrir dans Safari</a>' +
      '<button class="btn btn--ghost" data-a="installer-copier">Copier le lien</button></div></li>' +
      '<li>Touchez <b>Partager</b> ' + ICONE_PARTAGER + ' en bas de l\'écran (en haut sur iPad).</li>' +
      '<li>Faites défiler, touchez <b>« Sur l\'écran d\'accueil »</b> ' + ICONE_AJOUTER + ' puis <b>Ajouter</b>.</li></ol>' +
      '<p class="muted">L\'icône « Fiches chantier » apparaît sur l\'écran d\'accueil : ouvrez l\'appli avec elle.</p>';
  }
  function etapesAndroid() {
    if (invite) {
      return '<p class="lead">Touchez « Installer », puis confirmez : l\'icône « Fiches chantier » arrive sur l\'écran d\'accueil.</p>' +
        '<button class="btn btn--primary btn--big" data-a="installer-android">📲 Installer</button>';
    }
    var chrome = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
    return '<ol class="etapes-install"><li><b>Ouvrir dans Chrome</b> (si le lien s\'est ouvert dans WhatsApp ou une autre appli)' +
      '<div class="foot__row"><a class="btn btn--ghost" href="' + h(chrome) + '">Ouvrir dans Chrome</a>' +
      '<button class="btn btn--ghost" data-a="installer-copier">Copier le lien</button></div></li>' +
      '<li>Dans Chrome, touchez <b>⋮</b> en haut à droite.</li><li>Touchez <b>« Installer l\'application »</b> (ou « Ajouter à l\'écran d\'accueil »), puis <b>Installer</b>.</li></ol>';
  }
  function feuille() {
    return '<div class="sheet__h"><strong>Installer l\'appli</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      blocCode() + (iphone() ? etapesIphone() : etapesAndroid());
  }

  var ACTIONS = {
    'installer': function () { ES.etat.feuille = { type: 'installation' }; },
    'installer-android': async function () {
      if (!invite) return;
      var e = invite;
      invite = null;
      e.prompt();
      var choix = await e.userChoice;
      ES.etat.feuille = null;
      if (choix && choix.outcome !== 'accepted') o.toast('Installation annulée : vous pourrez la relancer depuis « Mon compte ».');
    },
    'installer-copier': async function () {
      try { await root.navigator.clipboard.writeText(adresse()); o.toast('Lien copié : collez-le dans ' + (iphone() ? 'Safari' : 'Chrome')); }
      catch (e) { o.toast('Copie impossible : ' + adresse()); }
    }
  };

  ES.installation = { bandeau: bandeau, boutonCompte: boutonCompte, feuille: feuille, ACTIONS: ACTIONS,
    garderCode: garderCode, codeGarde: codeGarde, oublierCode: oublierCode, installee: installee };
})(window);
