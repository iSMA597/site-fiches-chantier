/*
 * Appli V2, lot C : notifications sur le téléphone (Web Push), décision 19.
 * L'utilisateur les active lui-même (bouton dans « Mon compte ») ; le téléphone est alors rattaché à son compte.
 * iPhone : il faut d'abord ajouter l'appli à l'écran d'accueil (iOS 16.4 ou plus).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;
  var CLE_AIDE_IPHONE = ((root.ES_CONFIG && root.ES_CONFIG.prefixe) || 'es2_') + 'aide_iphone_vue';

  function estIphone() { return /iPhone|iPad|iPod/.test(navigator.userAgent); }
  function estInstallee() { return root.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function possible() { return 'serviceWorker' in navigator && 'PushManager' in root && 'Notification' in root; }

  // 'ios-a-installer' | 'non-supporte' | 'refusees' | 'actives' | 'inactives'
  async function etat() {
    if (estIphone() && !estInstallee()) return 'ios-a-installer';
    if (!possible() || !root.ES_CONFIG.vapidPublique) return 'non-supporte';
    if (Notification.permission === 'denied') return 'refusees';
    var reg = await navigator.serviceWorker.getRegistration();
    var abonnement = reg && await reg.pushManager.getSubscription();
    return abonnement && Notification.permission === 'granted' ? 'actives' : 'inactives';
  }

  function cleServeur() {
    var b64 = root.ES_CONFIG.vapidPublique.replace(/-/g, '+').replace(/_/g, '/');
    var brut = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    return Uint8Array.from(brut, function (c) { return c.charCodeAt(0); });
  }
  async function abonner() {
    var reg = await navigator.serviceWorker.ready;
    var abonnement = await reg.pushManager.getSubscription() ||
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleServeur() });
    await root.Cloud.abonnerPush(abonnement);
  }
  async function activer() {
    if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications refusées sur ce téléphone.');
    await abonner();
  }
  // à chaque connexion : si les notifications sont déjà autorisées, ce téléphone est rattaché au compte connecté
  async function rattacher() {
    try { if (possible() && Notification.permission === 'granted' && root.ES_CONFIG.vapidPublique) await abonner(); }
    catch (e) { /* hors réseau : on réessaiera à la prochaine ouverture */ }
  }

  var TEXTES = {
    'ios-a-installer': 'Sur iPhone : touchez <b>Partager</b> ⬆ puis <b>« Sur l\'écran d\'accueil »</b>, et ouvrez l\'appli depuis son icône. Les notifications seront alors possibles.',
    'non-supporte': 'Ce navigateur ne reçoit pas les notifications. Les rappels restent visibles dans l\'appli.',
    'refusees': 'Notifications bloquées : autorisez-les dans les réglages du téléphone pour cette appli.',
    'actives': '✓ Ce téléphone reçoit les notifications (nouvelles fiches, corrections, validations, rappels de la veille).',
    'inactives': 'Recevez une alerte pour les nouvelles fiches, les corrections, les validations et les rappels de la veille à 18 h.'
  };
  // bloc de la feuille « Mon compte »
  function blocCompte(etatActuel) {
    return '<h5>🔔 Notifications</h5><p class="muted">' + TEXTES[etatActuel] + '</p>' +
      (etatActuel === 'inactives' ? '<button class="btn btn--primary btn--block" data-a="activer-notifications">🔔 Activer les notifications</button>' : '');
  }
  // aide affichée une fois sur l'accueil d'un iPhone (risque « notifications sur iPhone » du plan)
  function aideIphone() {
    var vue = false;
    try { vue = !!localStorage.getItem(CLE_AIDE_IPHONE); } catch (e) { /* stockage indisponible */ }
    if (vue || !estIphone() || estInstallee()) return '';
    return '<div class="info"><b>📲 Installez l\'appli sur l\'iPhone</b><br>' + TEXTES['ios-a-installer'] +
      ' <button class="link" data-a="aide-iphone-vue">Compris</button></div>';
  }

  var ACTIONS = {
    'activer-notifications': async function () {
      try { await activer(); o.toast('Notifications activées'); } catch (e) { o.toast(e.message); }
      ES.etat.feuille = { type: 'compte', notifications: await etat() };
    },
    'aide-iphone-vue': function () { try { localStorage.setItem(CLE_AIDE_IPHONE, '1'); } catch (e) { /* ignoré */ } }
  };

  ES.notifications = { etat: etat, rattacher: rattacher, blocCompte: blocCompte, aideIphone: aideIphone, ACTIONS: ACTIONS };
})(window);
