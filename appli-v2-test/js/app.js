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
      case 'tdb': return ES.tableau.vue();
      case 'tdb-chantier': return ES.tableau.vueChantier();
      case 'reg': return ES.registre.vue();
      case 'reg-chantier': return ES.registre.vueChantier();
      case 'alobees': return ES.alobees.vue();
      case 'import-structure': return ES.importStructure.vue();
      case 'accueil': return ES.accueil.vue();
      default: return { haut: '', contenu: '<p class="empty">Chargement…</p>', bas: '' };
    }
  }
  function feuilleCourante() {
    var f = ES.etat.feuille;
    if (!f) return '';
    var corps = { guide: function () { return ES.assistant.feuilleGuide(f.etape); }, compte: ES.accueil.feuilleCompte,
      valider: ES.reception.feuilleValider, renvoyer: ES.reception.feuilleRenvoyer,
      'rappel-materiel': ES.programmation.feuilleMateriel, 'rappel-coulage': ES.programmation.feuilleCoulage,
      logement: ES.tableau.feuilleLogement, 'chantier-infos': ES.registre.feuilleInfos, 'plan-ajout': ES.registre.feuillePlan,
      code: ES.personnes.feuilleCode, 'personne-ajout': ES.personnes.feuilleAjout, personne: ES.personnes.feuillePersonne }[f.type]();
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
  // structure des chantiers utilisée par la fiche (après une modification dans le Registre)
  async function rafraichirRegistreFiches() {
    try { ES.etat.registre = (await root.Cloud.registre()).cfg; } catch (e) { /* hors réseau */ }
    try { ES.etat.plansPerimes = await root.Cloud.plansPerimes(); } catch (e) { ES.etat.plansPerimes = []; }
  }
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
    await rafraichirRegistreFiches();
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
    else if (q.get('registre') && ES.onglets.zones().indexOf('reg') >= 0) { await ES.registre.ouvrir(); await ES.registre.ACTIONS['reg-chantier'](q.get('registre')); }
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
    if (ES.etat.ecran.n === 'connexion') return actionsCommunes[nom] || ES.connexion.ACTIONS[nom];
    return actionsCommunes[nom] || ES.reception.ACTIONS[nom] || ES.programmation.ACTIONS[nom] || ES.notifications.ACTIONS[nom] ||
      ES.onglets.ACTIONS[nom] || ES.tableau.ACTIONS[nom] || ES.registre.ACTIONS[nom] || ES.personnes.ACTIONS[nom] ||
      ES.alobees.ACTIONS[nom] || ES.importStructure.ACTIONS[nom] || ES.accueil.ACTIONS[nom] ||
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
    if (ev.target.dataset && ev.target.dataset.saisie && ev.target.type !== 'file' && ES.etat.ecran.n === 'assistant') ES.assistant.saisie(ev.target);
    if (ev.target.dataset && ev.target.dataset.saisieFeuille && ES.etat.feuille) {
      ES.etat.feuille[ev.target.dataset.saisieFeuille] = ev.target.value;
      var bouton = document.querySelector('[data-a="renvoyer-ok"]');      // sans réafficher : le curseur reste en place
      if (bouton) bouton.disabled = !(ES.etat.feuille.points.length || ev.target.value.trim());
    }
  });
  // dates choisies dans le calendrier du téléphone
  var DATES = {
    'date-coulage': function (v) { return ES.assistant.ACTIONS['choisir-coulage'](v || null); },
    'pg-date-prevue': function (v) { return ES.programmation.ACTIONS['pg-date'](v || null); },
    'pg-date-coulage': function (v) { return ES.programmation.ACTIONS['pg-coulage'](v || null); }
  };
  document.addEventListener('change', async function (ev) {
    var saisie = ev.target.dataset && ev.target.dataset.saisie;
    if (saisie === 'photo') { await ES.assistant.photosChoisies(ev.target); afficher(); }
    else if (saisie === 'import-structure') { await ES.importStructure.fichierChoisi(ev.target); afficher(); }
    else if (saisie === 'alobees-niveau') ES.alobees.saisie(ev.target);
    else if (DATES[saisie]) { await DATES[saisie](ev.target.value); afficher(); }
  });
  document.addEventListener('submit', async function (ev) {
    var nom = ev.target.dataset && ev.target.dataset.formulaire;
    if (!nom) return;
    ev.preventDefault();
    if (ES.registre && ES.registre.FORMULAIRES[nom]) await ES.registre.FORMULAIRES[nom](ev.target);
    else await ES.connexion.soumettre(nom);
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
      if (etat === 'absente') {
        ES.etat.ecran = { n: 'connexion' };
        var code = new URLSearchParams(location.search).get('code');          // QR code d'activation scanné
        if (/^\d{6}$/.test(code || '')) { ES.etat.etapeConnexion = 'code'; ES.etat.codePrerempli = code; root.history.replaceState(null, '', location.pathname); }
      }
      else await chargerSession();
    } catch (e) {
      ES.etat.ecran = { n: 'connexion' };
      ES.etat.erreurConnexion = e.message;
    }
    afficher();
    setInterval(function () { if (navigator.onLine) synchroniser(); }, 60000);   // filet de sécurité : envoi toutes les minutes
  }

  ES.app = { afficher: afficher, synchroniser: synchroniser, rafraichirListe: rafraichirListe, chargerSession: chargerSession,
    rafraichirRegistreFiches: rafraichirRegistreFiches };
  demarrer();
})(window);
