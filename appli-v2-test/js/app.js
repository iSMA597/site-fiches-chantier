/*
 * Appli V2 : chef d'orchestre. Démarre l'appli, choisit l'écran à afficher et transmet les clics aux écrans.
 * Chaque bouton porte data-a="nom-de-l-action" (et data-v="valeur") ; l'action est cherchée dans les écrans.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils;
  ES.etat = { ecran: { n: 'chargement' }, photos: [] };

  // ------------------------------------------------------------ affichage
  var positions = {};       // position de défilement par écran, gardée entre deux affichages
  function vueCourante() {
    var e = ES.etat.ecran;
    switch (e.n) {
      case 'connexion': return ES.connexion.vue();
      case 'assistant': return ES.assistant.vue();
      case 'envoyee': return ES.accueil.vueEnvoyee(e.id);
      case 'fiche': return ES.reception.vueFiche();
      case 'programmer': return ES.programmation.vueProgrammer();
      case 'accueil': return ES.accueil.vue();
      default: return { haut: '', contenu: '<p class="empty">Chargement…</p>', bas: '' };
    }
  }
  function feuilleCourante() {
    var f = ES.etat.feuille;
    if (!f) return '';
    var corps = { guide: function () { return ES.assistant.feuilleGuide(f.etape); }, compte: ES.accueil.feuilleCompte,
      valider: ES.reception.feuilleValider, renvoyer: ES.reception.feuilleRenvoyer,
      'rappel-materiel': ES.programmation.feuilleMateriel, 'rappel-coulage': ES.programmation.feuilleCoulage }[f.type]();
    return '<div class="scrim" data-a="fermer-feuille"><div class="sheet" role="dialog" aria-modal="true" data-interieur>' + corps + '</div></div>';
  }
  function cleEcran() { var e = ES.etat.ecran; return e.n + '|' + (e.id || '') + '|' + (ES.etat.brouillon ? ES.etat.brouillon.etape : ''); }

  function afficher() {
    var racine = document.getElementById('appli');
    var ancien = racine.querySelector('.main');
    if (ancien && racine.dataset.cle) positions[racine.dataset.cle] = ancien.scrollTop;
    var v = vueCourante(), cle = cleEcran();
    racine.innerHTML = v.haut + '<main class="main" id="contenu"><div class="main__in">' + v.contenu + '</div></main>' + v.bas + feuilleCourante();
    var nouveau = racine.querySelector('.main');
    if (nouveau && positions[cle] !== undefined && racine.dataset.cle === cle) nouveau.scrollTop = positions[cle];
    racine.dataset.cle = cle;
    if (ES.etat.ecran.n === 'assistant') ES.assistant.apresAffichage(racine);
    if (ES.etat.feuille) ES.reception.apresAffichage(racine);
  }

  // ------------------------------------------------------------ données
  async function rafraichirListe() {
    ES.etat.outbox = await root.Cloud.outbox();
    try {
      ES.etat.fiches = await root.Cloud.fichesVisibles();
      ES.etat.vues = await root.Cloud.mesVues();
      ES.etat.programmations = await root.Cloud.programmations();
    } catch (e) { /* hors réseau : on garde la dernière liste */ }
  }
  async function synchroniser() {
    try { await root.Cloud.synchroniser(); } catch (e) { /* une erreur réseau ne bloque rien : on réessaiera */ }
    await rafraichirListe();
    afficher();
  }
  async function chargerSession() {
    ES.etat.profil = await root.Cloud.profil();
    ES.etat.registre = (await root.Cloud.registre()).cfg;
    ES.etat.monId = await root.Cloud.monId();
    ES.etat.brouillon = o.peutCreer(ES.etat.profil.role) ? ES.brouillon.charger() : null;
    ES.etat.photos = ES.etat.brouillon ? await ES.photos.liste(ES.etat.brouillon.id) : [];
    ES.etat.ecran = { n: 'accueil' };
    await rafraichirListe();
    ES.notifications.rattacher();               // ce téléphone reçoit les notifications du compte connecté
    await suivreLien();
    synchroniser();
  }
  // ouverture depuis une notification : ?fiche=…, ?rappel=incorporation&id=…, ?rappel=coulage&chantier=…&jour=…
  async function suivreLien() {
    var q = new URLSearchParams(location.search);
    if (!q.toString()) return;
    root.history.replaceState(null, '', location.pathname);
    if (q.get('fiche')) await ES.reception.ACTIONS.ouvrir(q.get('fiche'));
    else if (q.get('rappel') === 'incorporation') ES.etat.feuille = { type: 'rappel-materiel', id: q.get('id') };
    else if (q.get('rappel') === 'coulage') ES.etat.feuille = { type: 'rappel-coulage', chantier: q.get('chantier'), jour: q.get('jour') };
    if (ES.etat.feuille) await ES.programmation.preparerFeuille(ES.etat.feuille);
  }

  // ------------------------------------------------------------ clics, saisies, photos
  var actionsCommunes = {
    'fermer-feuille': function () { ES.etat.feuille = null; },
    'rien': function () { /* puce d'information */ }
  };
  function trouverAction(nom) {
    return actionsCommunes[nom] || ES.reception.ACTIONS[nom] || ES.programmation.ACTIONS[nom] || ES.notifications.ACTIONS[nom] ||
      ES.accueil.ACTIONS[nom] ||
      (ES.etat.ecran.n === 'assistant' && ES.assistant.ACTIONS[nom]);
  }
  document.addEventListener('click', async function (ev) {
    var cible = ev.target.closest('[data-a]');
    if (!cible || cible.disabled) return;
    if (cible.classList.contains('scrim') && ev.target.closest('[data-interieur]')) return;   // clic dans la feuille, pas sur le fond
    var action = trouverAction(cible.dataset.a);
    if (!action) return;
    if (!ES.etat.feuille || !cible.closest('.sheet')) ES.etat.feuille = null;    // un clic hors de la feuille la ferme
    await action(cible.dataset.v, ev);
    afficher();
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.dataset && ev.target.dataset.saisie && ev.target.type !== 'file') ES.assistant.saisie(ev.target);
    if (ev.target.dataset && ev.target.dataset.saisieFeuille && ES.etat.feuille) {
      ES.etat.feuille[ev.target.dataset.saisieFeuille] = ev.target.value;
      var bouton = document.querySelector('[data-a="renvoyer-ok"]');      // sans réafficher : le curseur reste en place
      if (bouton) bouton.disabled = !(ES.etat.feuille.points.length || ev.target.value.trim());
    }
  });
  document.addEventListener('change', async function (ev) {
    if (ev.target.dataset && ev.target.dataset.saisie === 'photo') { await ES.assistant.photosChoisies(ev.target); afficher(); }
  });
  document.addEventListener('submit', async function (ev) {
    if (ev.target.dataset.formulaire !== 'connexion') return;
    ev.preventDefault();
    await ES.connexion.seConnecter();
    afficher();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && ES.etat.feuille) { ES.etat.feuille = null; afficher(); }
  });
  root.addEventListener('online', synchroniser);
  root.addEventListener('offline', afficher);

  // ------------------------------------------------------------ démarrage
  async function demarrer() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* sans hors-ligne */ });
    afficher();
    try {
      await ES.gabarit.charger();
      if (!root.Cloud.actif) throw new Error('Serveur non configuré (js/config.js).');
      var etat = await root.Cloud.etatSession();
      if (etat === 'absente') ES.etat.ecran = { n: 'connexion' };
      else await chargerSession();
    } catch (e) {
      ES.etat.ecran = { n: 'connexion' };
      ES.etat.erreurConnexion = e.message;
    }
    afficher();
    setInterval(function () { if (navigator.onLine) synchroniser(); }, 60000);   // filet de sécurité : envoi toutes les minutes
  }

  ES.app = { afficher: afficher, synchroniser: synchroniser, rafraichirListe: rafraichirListe, chargerSession: chargerSession };
  demarrer();
})(window);
