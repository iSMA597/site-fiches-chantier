/*
 * Appli V2 : chef d'orchestre. Démarre l'appli, choisit l'écran à afficher et transmet les clics aux écrans.
 * Chaque bouton porte data-a="nom-de-l-action" (et data-v="valeur") ; l'action est cherchée dans les écrans.
 * Audit lot F : focus gardé après chaque réaffichage, feuilles accessibles (titre, focus, fond inerte),
 * pas de réaffichage pendant une saisie, erreurs toujours affichées, double appui ignoré.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils;
  ES.etat = { ecran: { n: 'chargement' }, photos: [], registre: { chantiers: [] } };

  // ------------------------------------------------------------ affichage
  var positions = {};       // position de défilement par écran, gardée entre deux affichages
  function vueCourante() {
    var e = ES.etat.ecran;
    switch (e.n) {
      case 'connexion': return ES.connexion.vue();
      case 'conditions': return ES.conditions.vue();
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
  var FEUILLES = {
    guide: function () { return ES.assistant.feuilleGuide(ES.etat.feuille.etape); },
    compte: function () { return ES.accueil.feuilleCompte(); },
    installation: function () { return ES.installation.feuille(); },
    valider: function () { return ES.reception.feuilleValider(); },
    renvoyer: function () { return ES.reception.feuilleRenvoyer(); },
    'rappel-materiel': function () { return ES.programmation.feuilleMateriel(); },
    'rappel-coulage': function () { return ES.programmation.feuilleCoulage(); },
    logement: function () { return ES.tableau.feuilleLogement(); },
    'chantier-infos': function () { return ES.registre.feuilleInfos(); },
    'chantier-supprimer': function () { return ES.registre.feuilleSupprimer(); },
    'retirer-fiche': function () { return ES.reception.feuilleRetirer(); },
    'plan-ajout': function () { return ES.registre.feuillePlan(); },
    code: function () { return ES.personnes.feuilleCode(); },
    'personne-ajout': function () { return ES.personnes.feuilleAjout(); },
    personne: function () { return ES.personnes.feuillePersonne(); }
  };
  function feuilleCourante() {
    var f = ES.etat.feuille;
    if (!f || !FEUILLES[f.type]) return '';
    return '<div class="scrim" data-a="fermer-feuille"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="feuille-titre" tabindex="-1" data-interieur>' +
      FEUILLES[f.type]() + '</div></div>';
  }
  function cleEcran() { var e = ES.etat.ecran; return e.n + '|' + (e.id || '') + '|' + (ES.etat.brouillon ? ES.etat.brouillon.etape : ''); }

  // repère de l'élément qui a le focus, pour le lui rendre après le réaffichage
  function repereFocus() {
    var a = document.activeElement;
    if (!a || a === document.body) return null;
    if (a.classList && a.classList.contains('sheet')) return '.sheet';
    if (a.dataset && a.dataset.a) return '[data-a="' + a.dataset.a + '"]' + (a.dataset.v !== undefined ? '[data-v="' + CSS.escape(a.dataset.v) + '"]' : '');
    if (a.dataset && a.dataset.saisie) return '[data-saisie="' + a.dataset.saisie + '"]' + (a.dataset.v !== undefined ? '[data-v="' + CSS.escape(a.dataset.v) + '"]' : '');
    return a.id ? '#' + CSS.escape(a.id) : null;
  }
  var feuilleOuverteAvant = false, declencheur = null;
  function afficher() {
    var racine = document.getElementById('appli');
    var ancien = racine.querySelector('.main'), ancienneFeuille = racine.querySelector('.sheet');
    if (ancien && racine.dataset.cle) positions[racine.dataset.cle] = ancien.scrollTop;
    var focus = repereFocus(), defilementFeuille = ancienneFeuille ? ancienneFeuille.scrollTop : 0;
    var v = vueCourante(), cle = cleEcran();
    racine.innerHTML = v.haut + '<main class="main" id="contenu"><div class="main__in">' + v.contenu + '</div></main>' + v.bas + feuilleCourante();
    var nouveau = racine.querySelector('.main');
    if (nouveau && positions[cle] !== undefined && racine.dataset.cle === cle) nouveau.scrollTop = positions[cle];
    var changementEcran = racine.dataset.cle !== cle;
    racine.dataset.cle = cle;
    if (ES.etat.ecran.n === 'assistant') ES.assistant.apresAffichage(racine);
    if (ES.etat.ecran.n === 'conditions') ES.conditions.apresAffichage(racine);
    if (ES.etat.feuille) ES.reception.apresAffichage(racine);
    // titre de la page = titre de l'écran (annoncé à chaque changement)
    var titre = racine.querySelector('.top__t strong');
    document.title = (titre ? titre.textContent + ' – ' : '') + 'Fiches chantier';
    gererFeuille(racine, focus, defilementFeuille);
    if (!ES.etat.feuille && !feuilleOuverteAvant) rendreFocus(racine, focus, changementEcran);
  }
  // feuille : titre accessible, focus à l'intérieur, fond inerte ; à la fermeture, focus rendu au bouton d'origine
  function gererFeuille(racine, focus, defilementFeuille) {
    var feuille = racine.querySelector('.sheet');
    var fond = racine.querySelectorAll('.top, .steps, .main, .foot, .tabs');
    for (var i = 0; i < fond.length; i++) fond[i].inert = !!feuille;
    if (feuille) {
      var titreFeuille = feuille.querySelector('.sheet__h strong, .sheet__h h2');
      if (titreFeuille) titreFeuille.id = 'feuille-titre';
      if (defilementFeuille) feuille.scrollTop = defilementFeuille;
      if (!feuilleOuverteAvant) { declencheur = focus; feuille.focus({ preventScroll: true }); }
      else rendreFocus(racine, focus, false);
    } else if (feuilleOuverteAvant && declencheur) {
      var bouton = racine.querySelector(declencheur);
      if (bouton) bouton.focus({ preventScroll: true });
      declencheur = null;
    }
    feuilleOuverteAvant = !!feuille;
  }
  function rendreFocus(racine, focus, changementEcran) {
    var el = focus && racine.querySelector(focus);
    if (el && !changementEcran) { el.focus({ preventScroll: true }); return; }
    if (changementEcran && document.activeElement && document.activeElement !== document.body) {
      var t = racine.querySelector('.top__t strong');
      if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
    }
  }
  // réaffichage venu de la synchronisation : jamais pendant une saisie, une signature ou sur la connexion
  function afficherSiCalme() {
    var a = document.activeElement;
    var saisie = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if (ES.etat.ecran.n === 'connexion' || ES.etat.ecran.n === 'conditions' || saisie || (ES.signature && ES.signature.enCours())) return;
    afficher();
  }

  // ------------------------------------------------------------ données
  // structure des chantiers utilisée par la fiche (après une modification dans le Registre)
  async function rafraichirRegistreFiches() {
    try {
      var r = await root.Cloud.registre();
      ES.etat.registre = r.cfg || { chantiers: [] };
      ES.etat.registreHorsLigne = !r.enLigne;
    } catch (e) { ES.etat.registre = ES.etat.registre || { chantiers: [] }; ES.etat.registreHorsLigne = true; }
    try { ES.etat.plansPerimes = await root.Cloud.plansPerimes(); } catch (e) { ES.etat.plansPerimes = ES.etat.plansPerimes || []; }
  }
  async function rafraichirListe() {
    ES.etat.outbox = await root.Cloud.outbox();
    try {
      ES.etat.fiches = await root.Cloud.fichesVisibles();
      ES.etat.vues = await root.Cloud.mesVues();
      ES.etat.programmations = await root.Cloud.programmations();
      if (ES.etat.registreHorsLigne) await rafraichirRegistreFiches();     // ouverte hors réseau : registre remis à jour au retour
    } catch (e) { /* hors réseau : on garde la dernière liste */ }
  }
  async function synchroniser() {
    try {
      var res = await root.Cloud.synchroniser();
      ES.etat.sessionExpiree = !!(res && res.sessionExpiree);
    } catch (e) { /* une erreur réseau ne bloque rien : on réessaiera */ }
    await rafraichirListe();
    afficherSiCalme();
  }
  async function chargerSession() {
    ES.etat.profil = await root.Cloud.profil();
    ES.etat.monId = ES.etat.profil.id;                                     // connu même hors réseau (profil en cache)
    if (await root.Cloud.verifierProprietaire(ES.etat.profil.id)) o.toast('Données d\'un autre compte effacées de ce téléphone');
    ES.etat.sessionExpiree = false;
    // conditions d'utilisation : à cocher et signer avant tout usage (et à chaque nouvelle version)
    if (await ES.conditions.aSigner()) { ES.etat.ecran = { n: 'conditions' }; return; }
    await rafraichirRegistreFiches();
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
    else if (q.get('alobees') === 'nouveaux' && ES.onglets.zones().indexOf('reg') >= 0) { await ES.registre.ouvrir(); await ES.alobees.ACTIONS['alobees-recos'](); }
    else if (q.get('rappel') === 'incorporation') ES.etat.feuille = { type: 'rappel-materiel', id: q.get('id') };
    else if (q.get('rappel') === 'coulage') ES.etat.feuille = { type: 'rappel-coulage', chantier: q.get('chantier'), jour: q.get('jour') };
    if (ES.etat.feuille) await ES.programmation.preparerFeuille(ES.etat.feuille);
  }

  // ------------------------------------------------------------ clics, saisies, photos
  var actionsCommunes = {
    'fermer-feuille': function () { ES.etat.feuille = null; },
    'rien': function () { /* puce d'information */ },
    // session expirée (compte inchangé) : retour à la connexion sans rien effacer
    'reconnecter': function () { ES.etat.ecran = { n: 'connexion' }; ES.etat.etapeConnexion = null; }
  };
  function trouverAction(nom) {
    if (ES.etat.ecran.n === 'connexion') return actionsCommunes[nom] || ES.connexion.ACTIONS[nom] || ES.installation.ACTIONS[nom];
    if (ES.etat.ecran.n === 'conditions') return ES.conditions.ACTIONS[nom] || ES.accueil.ACTIONS[nom];
    return actionsCommunes[nom] || ES.installation.ACTIONS[nom] || ES.reception.ACTIONS[nom] || ES.programmation.ACTIONS[nom] || ES.notifications.ACTIONS[nom] ||
      ES.onglets.ACTIONS[nom] || ES.tableau.ACTIONS[nom] || ES.registre.ACTIONS[nom] || ES.personnes.ACTIONS[nom] ||
      ES.alobees.ACTIONS[nom] || ES.importStructure.ACTIONS[nom] || ES.accueil.ACTIONS[nom] ||
      (ES.etat.ecran.n === 'assistant' && ES.assistant.ACTIONS[nom]);
  }
  // exécute une action : écran mis à jour tout de suite, message clair en cas d'erreur, réaffichage à la fin
  async function executer(travail) {
    try {
      var promesse = travail();
      if (promesse && promesse.then) { afficher(); await promesse; }
    } catch (e) {
      console.error(e);
      o.toast(e && e.message ? e.message : 'Une erreur est survenue. Réessayez.', true);
    } finally {
      afficher();
    }
  }
  var enCours = {};                              // double appui : la même action ne repart pas avant d'avoir fini
  document.addEventListener('click', function (ev) {
    var cible = ev.target.closest('[data-a]');
    if (!cible || cible.disabled) return;
    if (cible.classList.contains('scrim') && ev.target.closest('[data-interieur]')) return;   // clic dans la feuille, pas sur le fond
    var action = trouverAction(cible.dataset.a);
    if (!action) return;
    var cle = cible.dataset.a + '|' + (cible.dataset.v || '');
    if (enCours[cle]) return;
    if (!ES.etat.feuille || !cible.closest('.sheet')) ES.etat.feuille = null;    // un clic hors de la feuille la ferme
    enCours[cle] = true;
    executer(function () { return action(cible.dataset.v, ev); }).then(function () { delete enCours[cle]; });
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.dataset && ev.target.dataset.saisie && ev.target.type !== 'file' && ES.etat.ecran.n === 'assistant') ES.assistant.saisie(ev.target);
    if (ev.target.dataset && ev.target.dataset.saisieFeuille && ES.etat.feuille) {
      ES.etat.feuille[ev.target.dataset.saisieFeuille] = ev.target.value;
      var bouton = document.querySelector('[data-a="renvoyer-ok"]');      // sans réafficher : le curseur reste en place
      if (bouton) bouton.disabled = !(ES.etat.feuille.points.length || ev.target.value.trim());
      var retirer = document.querySelector('[data-a="retirer-ok"]');
      if (retirer) retirer.disabled = ev.target.value.trim().length < 3;
    }
  });
  // dates choisies dans le calendrier du téléphone
  var DATES = {
    'date-coulage': function (v) { return ES.assistant.ACTIONS['choisir-coulage'](v || null); },
    'pg-date-prevue': function (v) { return ES.programmation.ACTIONS['pg-date'](v || null); },
    'pg-date-coulage': function (v) { return ES.programmation.ACTIONS['pg-coulage'](v || null); }
  };
  document.addEventListener('change', function (ev) {
    var saisie = ev.target.dataset && ev.target.dataset.saisie;
    if (saisie === 'photo') executer(function () { return ES.assistant.photosChoisies(ev.target); });
    else if (saisie === 'import-structure') executer(function () { return ES.importStructure.fichierChoisi(ev.target); });
    else if (saisie === 'alobees-niveau') ES.alobees.saisie(ev.target);
    else if (DATES[saisie]) executer(function () { return DATES[saisie](ev.target.value); });
  });
  document.addEventListener('submit', function (ev) {
    var nom = ev.target.dataset && ev.target.dataset.formulaire;
    if (!nom) return;
    ev.preventDefault();
    executer(function () {
      return ES.registre && ES.registre.FORMULAIRES[nom] ? ES.registre.FORMULAIRES[nom](ev.target) : ES.connexion.soumettre(nom);
    });
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && ES.etat.feuille) { ES.etat.feuille = null; afficher(); }
  });
  root.addEventListener('online', function () { o.toast('Réseau revenu : envoi des fiches en attente'); synchroniser(); });
  root.addEventListener('offline', function () { o.toast('Hors réseau : les fiches partiront au retour du réseau'); afficherSiCalme(); });

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
        var code = new URLSearchParams(location.search).get('code');          // QR code ou lien d'activation (WhatsApp…)
        if (/^\d{6}$/.test(code || '')) { ES.installation.garderCode(code); root.history.replaceState(null, '', location.pathname); }
        else code = ES.installation.codeGarde();                               // appli installée après avoir ouvert le lien
        if (code) { ES.etat.etapeConnexion = 'code'; ES.etat.codePrerempli = code; }
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
