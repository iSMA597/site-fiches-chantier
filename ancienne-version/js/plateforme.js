/*
 * Euro Sanichauff – interface du mode connecté (Projet 4, module 1 « Incorporations avant coulage »)
 * Connexion par identifiant (session mémorisée), onglets selon le profil :
 *   Nouvelle fiche · Fiches à valider · Tableau de bord · Chantiers · Équipe · Plans · Facturation · Mes fiches · Guide
 * S'appuie sur app.js (window.ESApp) et cloud.js (window.Cloud).
 */
(function () {
  'use strict';

  var ROLES = { admin: 'Direction / administrateur', conducteur: 'Conducteur de travaux', chef_chantier: 'Chef de chantier',
    compagnon: 'Compagnon', facturation: 'Facturation' };
  var FONCTIONS = { chef_chantier: 'Chef de chantier', chef_equipe: 'Chef d\'équipe', compagnon: 'Compagnon' };
  var STATUTS = ['VALIDÉ', 'À VALIDER', 'ANOMALIE', 'EN COURS', 'À FAIRE'];
  var TOUS = ['admin', 'conducteur', 'chef_chantier', 'compagnon', 'facturation'];
  var A, S, h;
  var etat = { profil: null, horsLigne: false, chantierId: null };

  var ONGLETS = [
    { id: 'fiche', lib: '+ Nouvelle fiche', roles: ['admin', 'conducteur', 'chef_chantier', 'compagnon'], fn: function () { A.demarrerFiche(null, 0); } },
    { id: 'valider', lib: 'Fiches à valider', roles: ['admin', 'conducteur', 'chef_chantier'], fn: function () { fichesAValider(); } },
    { id: 'tdb', lib: 'Tableau de bord', roles: ['admin', 'conducteur'], fn: function () { tableauGeneral(); } },
    { id: 'chantiers', lib: 'Chantiers', roles: ['admin', 'conducteur'], fn: function () { chantiersView(); } },
    { id: 'equipe', lib: 'Équipe', roles: ['admin', 'conducteur'], fn: function () { equipeView(); } },
    { id: 'plans', lib: 'Plans', roles: ['admin', 'conducteur', 'chef_chantier', 'compagnon'], fn: function () { plansView(); } },
    { id: 'factu', lib: 'Facturation', roles: ['admin', 'facturation'], fn: function () { facturationView(); } },
    { id: 'mes', lib: 'Mes fiches (cet appareil)', roles: ['admin', 'conducteur', 'chef_chantier', 'compagnon'], fn: function () { A.historyView(); } },
    { id: 'guide', lib: 'Guide', roles: TOUS, fn: function () { guideView(); } }
  ];

  function actif() { return !!(window.Cloud && window.Cloud.actif); }
  function peut(roles) { return etat.profil && roles.indexOf(etat.profil.role) >= 0; }
  function mesOnglets() { return ONGLETS.filter(function (o) { return peut(o.roles); }); }
  function fr(d) { return window.FicheXlsx.frDate(d); }

  function ecran(titre, sous, large, ongletCourant) {
    A.nav.hidden = true;
    document.getElementById('progress').hidden = true;
    A.view.innerHTML = '';
    A.view.className = 'view' + (large ? ' view--wide' : '');
    A.title(titre, sous);
    if (ongletCourant) A.view.appendChild(barreOnglets(ongletCourant));
  }
  function barreOnglets(courant) {
    return h('nav', { class: 'onglets', 'aria-label': 'Onglets' }, [
      h('button', { class: 'onglet', text: '⌂ Accueil', onclick: home })
    ].concat(mesOnglets().filter(function (o) { return o.id !== 'fiche' && o.id !== 'mes'; }).map(function (o) {
      return h('button', { class: 'onglet', 'aria-current': o.id === courant ? 'page' : null, text: o.lib, onclick: o.fn });
    })));
  }
  function bandeauEnv() {
    var env = (window.ES_CONFIG || {}).environnement;
    return env && env !== 'production' ? h('div', { class: 'banner banner--env', text: 'Version de ' + env + ' – données de démonstration' }) : null;
  }
  function choixChantier(courant, onPick) {
    return h('div', { class: 'chips', style: 'margin:12px 0' }, S.config.chantiers.map(function (c) {
      return h('button', { class: 'chip', 'aria-pressed': String(c.id === courant), text: c.nom, onclick: function () { onPick(c.id); } });
    }));
  }
  async function rafraichirRegistre() {
    try { var reg = await Cloud.registre(); S.config = reg.cfg; etat.horsLigne = !reg.enLigne; } catch (e) { /* cache conservé */ }
  }

  // ------------------------------------------------------------ démarrage / connexion
  async function demarrer() {
    A = window.ESApp; S = A.S; h = A.h;
    window.addEventListener('online', function () { synchro(true); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) synchro(true); });
    Cloud.surChangement(function (res) {
      if (res && res.recues) majHistorique(res.recues);
      var b = document.getElementById('syncBadge');
      if (b) majBadge(b);
    });
    // hors ligne avec une session gardée sur l'appareil : on travaille avec le profil et le registre en mémoire
    var st = await Cloud.etatSession();
    if (st === 'absente') { connexionView(); return; }
    await charger();
  }

  async function charger() {
    ecran('Chargement…', '');
    try {
      etat.profil = await Cloud.profil();
      var reg = await Cloud.registre();
      S.config = reg.cfg;
      etat.horsLigne = !reg.enLigne || !!etat.profil.horsLigne;
      home();
      synchro(false);
    } catch (e) {
      A.toast(e.message || 'Erreur de connexion', 5000);
      if (e.session) {
        // session refusée par le serveur (compte désactivé, session révoquée) : reconnexion, fiches en attente conservées
        connexionView();
      } else {
        ecran('Hors ligne', 'Fiches chantier');
        A.view.appendChild(h('div', { class: 'banner', text: 'Serveur injoignable et aucune donnée en mémoire sur cet appareil. Réessayez avec du réseau.' }));
        A.view.appendChild(h('button', { class: 'btn btn--primary btn--block', text: 'Réessayer', onclick: charger }));
      }
    }
  }

  function connexionView() {
    ecran('Connexion', 'Fiches chantier');
    var ident = h('input', { class: 'input', type: 'text', id: 'lg_id', autocomplete: 'username', autocapitalize: 'none',
      spellcheck: 'false', placeholder: 'ex. karim.b' });
    var mdp = h('input', { class: 'input', type: 'password', id: 'lg_mdp', autocomplete: 'current-password' });
    var btn = h('button', { class: 'btn btn--primary btn--block', text: 'Se connecter', onclick: go });
    async function go() {
      if (!ident.value || !mdp.value) { A.toast('Identifiant et mot de passe obligatoires.'); return; }
      btn.disabled = true; btn.textContent = 'Connexion…';
      try { await Cloud.connexion(ident.value, mdp.value); await charger(); }
      catch (e) {
        A.toast(e.message === 'Email ou mot de passe incorrect.' ? 'Identifiant ou mot de passe incorrect.' : e.message, 5000);
        btn.disabled = false; btn.textContent = 'Se connecter';
      }
    }
    mdp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    A.view.appendChild(h('div', { class: 'home-hero' }, [h('img', { src: 'icons/logo.png', alt: 'Euro Sanichauff' })]));
    var b = bandeauEnv(); if (b) A.view.appendChild(b);
    A.view.appendChild(h('div', { class: 'card login' }, [
      h('div', { class: 'field' }, [h('label', { text: 'Identifiant', for: 'lg_id' }), ident]),
      h('div', { class: 'field' }, [h('label', { text: 'Mot de passe', for: 'lg_mdp' }), mdp]),
      btn,
      h('p', { class: 'muted', text: 'Connexion mémorisée sur cet appareil : pas besoin de la refaire. Identifiant et mot de passe donnés par le bureau.' })
    ]));
  }

  // ------------------------------------------------------------ synchronisation
  async function synchro(silencieux) {
    if (!actif()) return;
    var res = await Cloud.synchroniser();
    if (!silencieux && res.envoyees) A.toast(res.envoyees + ' fiche(s) envoyée(s) au serveur.');
    if (res.erreurs) A.toast(res.erreurs + ' fiche(s) refusée(s) par le serveur : voir l\'accueil.', 5000);
    return res;
  }
  function majHistorique(lignes) {
    var hist = A.load(A.KEYS.history, []);
    var change = false;
    lignes.forEach(function (row) {
      if (S.fiche && S.fiche.id === row.id) S.fiche.serverVersion = row.version;
      hist.forEach(function (e) {
        if (e.fiche && e.fiche.id === row.id) {
          e.fiche.serverVersion = row.version; e.statut = row.resultat; e.serveur = row.etat; e.recu = row.received_at; change = true;
        }
      });
    });
    if (change) A.save(A.KEYS.history, hist);
  }
  async function majBadge(el) {
    var o = await Cloud.outbox();
    el.innerHTML = '';
    if (!o.length) {
      el.className = 'sync sync--ok';
      el.appendChild(h('span', { text: navigator.onLine ? '✓ Tout est envoyé au serveur' : '✓ Rien en attente (hors ligne)' }));
      return;
    }
    var errs = o.filter(function (x) { return x.erreur; });
    el.className = 'sync ' + (errs.length ? 'sync--ko' : 'sync--wait');
    el.appendChild(h('strong', { text: o.length + ' fiche(s) en attente d\'envoi' + (navigator.onLine ? '' : ' (hors ligne)') }));
    errs.forEach(function (x) {
      el.appendChild(h('div', { class: 'sync__err' }, [
        h('span', { text: [x.fiche.batiment, x.fiche.niveau, (x.fiche.logements || []).join(' ')].join(' · ') + ' : ' + x.erreur }),
        !x.recue ? h('button', { class: 'chip', text: 'Corriger', onclick: function () {
          A.demarrerFiche(null, 0, x.fiche);
        } }) : null,
        h('button', { class: 'chip', text: 'Retirer', onclick: async function () {
          if (confirm('Retirer cette fiche de la boîte d\'envoi ? (elle reste dans « Mes fiches » et peut partir par mail)')) {
            await Cloud.retirer(x.id); majBadge(el);
          }
        } })
      ]));
    });
    el.appendChild(h('button', { class: 'btn btn--ghost', text: 'Synchroniser maintenant', onclick: async function () {
      await synchro(false); majBadge(el);
    } }));
  }

  // ------------------------------------------------------------ accueil
  function home() {
    var p = etat.profil;
    ecran(p.nom, ROLES[p.role] || p.role);
    var b = bandeauEnv(); if (b) A.view.appendChild(b);
    if (etat.horsLigne) A.view.appendChild(h('div', { class: 'banner', text: 'Hors ligne : registre en mémoire. Les fiches partiront au retour du réseau.' }));
    var badge = h('div', { id: 'syncBadge', class: 'sync' });
    A.view.appendChild(badge);
    majBadge(badge);
    var st = h('div', { class: 'stack' });
    var draft = A.load(A.KEYS.draft, null);
    mesOnglets().forEach(function (o, i) {
      st.appendChild(h('button', { class: 'btn btn--block ' + (i === 0 ? 'btn--primary' : 'btn--ghost'), text: o.lib, onclick: o.fn }));
      if (o.id === 'fiche' && draft && draft.fiche) {
        st.appendChild(h('button', { class: 'btn btn--gold btn--block', text: 'Reprendre la fiche en cours', onclick: function () {
          S.fiche = draft.fiche; A.go(draft.step || 0);
        } }));
      }
    });
    if (peut(['admin'])) st.appendChild(h('button', { class: 'btn btn--ghost btn--block', text: 'Paramètres (mail de secours)', onclick: A.settingsView }));
    st.appendChild(h('button', { class: 'btn btn--danger btn--block', text: 'Se déconnecter', onclick: deconnexion }));
    A.view.appendChild(st);
    A.view.appendChild(h('p', { class: 'muted', style: 'text-align:center;margin-top:20px',
      text: S.config.chantiers.length + ' chantier(s) accessible(s)' + (S.config.maj ? ' · registre du ' + new Date(S.config.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '') }));
  }

  async function deconnexion() {
    var o = await Cloud.outbox();
    if (o.length) {
      if (!confirm(o.length + ' fiche(s) PAS ENCORE ENVOYÉE(S).\n\nSe déconnecter les SUPPRIME de cet appareil (pour qu\'un autre compte ne les envoie pas à votre place).\n\nConseil : annulez, attendez le réseau ou envoyez-les par mail.\n\nSupprimer et se déconnecter ?')) return;
    } else if (!confirm('Se déconnecter ? Les fiches et brouillons de cet appareil seront effacés.')) {
      return;
    }
    await Cloud.deconnexion();
    etat.profil = null;
    connexionView();
  }

  // ------------------------------------------------------------ envoi au serveur (depuis le récapitulatif)
  function resoudreIds(f) {
    var c = S.config.chantiers.filter(function (x) { return x.nom === f.chantier; })[0];
    var b = c && c.batiments.filter(function (x) { return x.nom === f.batiment; })[0];
    var n = b && b.niveaux.filter(function (x) { return window.FicheXlsx.niveauLabel(x.num) === f.niveau; })[0];
    if (!c || !b || !n) throw new Error('Chantier / bâtiment / niveau introuvable dans le registre.');
    f.chantier_id = c.id; f.batiment_id = b.id; f.niveau_id = n.id;
  }

  function boutonEnvoiServeur(f) {
    var btn = h('button', { class: 'btn btn--primary btn--block', text: 'Envoyer au bureau', onclick: async function () {
      btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        resoudreIds(f);
        await Cloud.mettreEnFile(f);
        var hist = A.load(A.KEYS.history, []).filter(function (e) { return !e.fiche || e.fiche.id !== f.id; });
        hist.unshift({ id: f.id, envoye: new Date().toISOString(), mode: 'serveur', statut: window.FicheXlsx.stats(S.contenu, f).statut, fiche: f });
        A.save(A.KEYS.history, hist.slice(0, 60));
        try { localStorage.removeItem(A.KEYS.draft); } catch (e) { /* ignoré */ }
        var res = await Cloud.synchroniser();
        var recue = res.recues.filter(function (r) { return r.id === f.id; })[0];
        var reste = (await Cloud.outbox()).filter(function (x) { return x.id === f.id; })[0];
        apresEnvoi(f, recue, reste);
      } catch (e) {
        A.erreur(e); btn.disabled = false; btn.textContent = 'Envoyer au bureau';
      }
    } });
    return h('div', { class: 'stack', style: 'margin-bottom:10px' }, [btn]);
  }

  function apresEnvoi(f, recue, reste) {
    ecran('Fiche envoyée', f.chantier);
    A.view.appendChild(h('div', { class: 'home-hero' }, [h('img', { src: 'icons/logo.png', alt: '' })]));
    if (recue) {
      A.view.appendChild(h('h1', { text: '✓ Fiche enregistrée sur le serveur' }));
      A.view.appendChild(h('p', { class: 'lead', text: 'Résultat : ' + recue.resultat + ' (' + recue.ok + ' / ' + recue.total + ', ' + recue.ko + ' anomalie(s)). Le chef de chantier peut la valider.' }));
    } else if (reste && reste.erreur) {
      A.view.appendChild(h('h1', { text: '⚠ Fiche refusée par le serveur' }));
      A.view.appendChild(h('div', { class: 'alert', text: reste.erreur }));
    } else {
      A.view.appendChild(h('h1', { text: '⏳ En attente de réseau' }));
      A.view.appendChild(h('p', { class: 'lead', text: 'La fiche est gardée sur l\'appareil et partira automatiquement au retour du réseau. Vous pouvez aussi l\'envoyer par mail (secours).' }));
    }
    A.view.appendChild(h('div', { class: 'stack' }, [
      h('button', { class: 'btn btn--primary btn--block', text: '+ Fiche suivante (même niveau)', onclick: function () {
        A.demarrerFiche(f, 3);
      } }),
      !recue ? h('button', { class: 'btn btn--ghost btn--block', text: 'Envoyer par mail (secours)', onclick: function () {
        S.fiche = f; A.go(A.steps().length - 1);
      } }) : null,
      h('button', { class: 'btn btn--ghost btn--block', text: 'Accueil', onclick: home })
    ]));
  }

  // ------------------------------------------------------------ fiches : liste, détail, validation
  function cle(s) {
    return { 'VALIDÉ': 'ok', 'À VALIDER': 'val', 'ANOMALIE': 'ko', 'EN COURS': 'run', 'À FAIRE': 'todo' }[s] || 'todo';
  }
  function ligneFiche(f, recharger) {
    var etatTxt = { soumise: 'Soumise', validee: 'Validée', remplacee: 'Remplacée' }[f.etat] || f.etat;
    var actions = h('div', { class: 'flist__actions' }, [
      h('button', { class: 'chip', text: 'Détail', onclick: function () { detailFiche(f, recharger); } }),
      h('button', { class: 'chip', text: 'Excel', onclick: function () { exporterExcel(f); } })
    ]);
    if (f.etat === 'soumise' && f.resultat === 'COMPLÈTE' && peut(['chef_chantier', 'conducteur', 'admin'])) {
      actions.appendChild(h('button', { class: 'chip chip--ok', text: 'Valider', onclick: function () { valider(f, recharger); } }));
    }
    return h('div', { class: 'flist__row' }, [
      h('div', {}, [
        h('strong', { text: (f.chantier ? f.chantier + ' · ' : '') + f.batiment + ' · ' + f.niveau + ' · Log. ' + f.logements.join(' ') }),
        h('div', { class: 'muted', text: fr(f.date_fiche) + ' · coulage ' + fr(f.coulage) + ' · ' + (f.auteur || '—') +
          (f.validee_par_nom ? ' · validée par ' + f.validee_par_nom : '') +
          (f.facturee_le ? ' · facturée le ' + new Date(f.facturee_le).toLocaleDateString('fr-FR') : '') })
      ]),
      h('div', { class: 'flist__badges' }, [A.badge(f.resultat), h('span', { class: 'badge badge--etat', text: etatTxt })]),
      actions
    ]);
  }
  async function valider(f, recharger) {
    if (!confirm('Valider la fiche ' + f.batiment + ' · ' + f.niveau + ' · ' + f.logements.join(' ') + ' ?\nElle ne pourra plus être modifiée.')) return;
    try { await Cloud.valider(f.id); A.toast('Fiche validée et verrouillée.'); (recharger || home)(); } catch (e) { A.erreur(e); }
  }
  async function detailFiche(v, recharger) {
    ecran('Fiche', v.chantier || '', true, null);
    A.view.appendChild(h('button', { class: 'btn btn--ghost', text: '← Retour', onclick: function () { (recharger || home)(); } }));
    var zone = h('div', { class: 'muted', text: 'Chargement…' });
    A.view.appendChild(zone);
    try {
      var row = await Cloud.fiche(v.id);
      var labels = {};
      S.contenu.sections.forEach(function (s) { s.items.forEach(function (it) { labels[it.id] = it.libre ? (row.libres[it.id] || it.label) : it.label; }); });
      var kos = Object.keys(row.items || {}).filter(function (k) { return row.items[k] === 'KO'; });
      var nonFaits = Object.keys(labels).filter(function (k) { return !row.items[k] && !(S.contenu.sections.some(function (s) { return s.items.some(function (it) { return it.id === k && it.libre && !row.libres[k]; }); })); });
      zone.className = '';
      zone.innerHTML = '';
      zone.appendChild(h('h1', { text: v.batiment + ' · ' + v.niveau + ' · Log. ' + v.logements.join(' ') }));
      zone.appendChild(h('div', { class: 'flist__badges', style: 'margin-bottom:10px' }, [A.badge(row.resultat),
        h('span', { class: 'badge badge--etat', text: row.ok + ' / ' + row.total + ' points' })]));
      var dl = h('dl', { class: 'kv card' });
      [['Date', fr(row.date_fiche)], ['Coulage prévu', fr(row.coulage)], ['Auteur', v.auteur || '—'], ['Chef de chantier', row.chef || '—'],
        ['Compagnons', (row.compagnons || []).join(', ') || '—'], ['Contrôleur', row.controleur || '—'],
        ['Reçue le', new Date(row.received_at).toLocaleString('fr-FR')], ['Empreinte', row.empreinte ? row.empreinte.slice(0, 16) + '…' : '—']]
        .forEach(function (kv) { dl.appendChild(h('dt', { text: kv[0] })); dl.appendChild(h('dd', { text: kv[1] })); });
      zone.appendChild(dl);
      if (kos.length) zone.appendChild(h('div', { class: 'alert' }, [h('strong', { text: 'Anomalies' }), h('ul', {}, kos.map(function (k) { return h('li', { text: labels[k] }); }))]));
      if (nonFaits.length) zone.appendChild(h('div', { class: 'card' }, [h('strong', { text: 'Points non cochés (' + nonFaits.length + ')' }),
        h('ul', {}, nonFaits.map(function (k) { return h('li', { text: labels[k] }); }))]));
      if (row.observations) zone.appendChild(h('div', { class: 'card' }, [h('strong', { text: 'Observations' }), h('p', { text: row.observations })]));
      var ph = await Cloud.photosServeur(v.id);
      if (ph.length) zone.appendChild(h('div', { class: 'card' }, [h('strong', { text: 'Photos jointes (' + ph.length + ')' }),
        h('div', { class: 'thumbs' }, ph.map(function (p) { return h('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'thumb' }, [h('img', { src: p.url, alt: 'Photo' })]); }))]));
      if (row.signature) zone.appendChild(h('div', { class: 'card' }, [h('strong', { text: 'Signature' }), h('img', { src: row.signature, alt: 'Signature', style: 'max-width:280px;display:block' })]));
      var act = h('div', { class: 'stack' }, [h('button', { class: 'btn btn--ghost btn--block', text: 'Télécharger la fiche Excel', onclick: function () { exporterExcel(v); } })]);
      if (row.etat === 'soumise' && row.resultat === 'COMPLÈTE' && peut(['chef_chantier', 'conducteur', 'admin'])) {
        act.insertBefore(h('button', { class: 'btn btn--ok btn--block', text: 'Valider cette fiche', onclick: function () { valider(v, recharger); } }), act.firstChild);
      }
      zone.appendChild(act);
    } catch (e) { zone.textContent = e.message; }
  }
  async function exporterExcel(v) {
    try {
      var row = await Cloud.fiche(v.id);
      var fiche = {
        id: row.id, chantier: v.chantier, batiment: v.batiment, niveau: v.niveau, logements: row.logements,
        date: row.date_fiche, coulage: row.coulage || '', chef: row.chef || '', chef_equipe: row.chef_equipe || '',
        compagnons: row.compagnons || [], controleur: row.controleur || '', observations: row.observations || '',
        items: row.items || {}, libres: row.libres || {}, signature: row.signature, signatureRatio: row.signature_ratio
      };
      A.telecharger(await A.genererBlob(fiche), window.FicheXlsx.nomFichier(fiche));
    } catch (e) { A.erreur(e); }
  }

  async function fichesAValider() {
    ecran('Fiches à valider', 'Envoyées par les équipes', true, 'valider');
    var zone = h('div', { class: 'muted', text: 'Chargement…' });
    A.view.appendChild(zone);
    try {
      var liste = await Cloud.fichesParEtat('soumise');
      zone.className = 'flist';
      zone.innerHTML = '';
      if (!liste.length) { zone.appendChild(h('p', { class: 'lead', text: 'Aucune fiche en attente. ✓' })); return; }
      var pret = liste.filter(function (f) { return f.resultat === 'COMPLÈTE'; });
      var autres = liste.filter(function (f) { return f.resultat !== 'COMPLÈTE'; });
      if (pret.length) zone.appendChild(h('h2', { text: 'Complètes : à valider (' + pret.length + ')' }));
      pret.forEach(function (f) { zone.appendChild(ligneFiche(f, fichesAValider)); });
      if (autres.length) zone.appendChild(h('h2', { text: 'Anomalies / incomplètes (' + autres.length + ')' }));
      autres.forEach(function (f) { zone.appendChild(ligneFiche(f, fichesAValider)); });
    } catch (e) { zone.textContent = e.reseau ? 'Indisponible hors ligne.' : e.message; }
  }

  async function facturationView() {
    ecran('Facturation', 'Fiches validées', true, 'factu');
    var zone = h('div', { class: 'muted', text: 'Chargement…' });
    A.view.appendChild(zone);
    try {
      var liste = await Cloud.fichesParEtat('validee');
      zone.className = 'flist';
      zone.innerHTML = '';
      var afact = liste.filter(function (f) { return !f.facturee_le; });
      if (afact.length) zone.appendChild(h('button', { class: 'btn btn--gold', text: 'Marquer ' + afact.length + ' fiche(s) comme facturée(s)', onclick: async function () {
        if (!confirm(afact.length + ' fiche(s) marquée(s) comme facturée(s) ?')) return;
        try { var n = await Cloud.marquerFacturee(afact.map(function (f) { return f.id; })); A.toast(n + ' fiche(s) facturée(s).'); facturationView(); }
        catch (e) { A.erreur(e); }
      } }));
      if (!liste.length) zone.appendChild(h('p', { class: 'lead', text: 'Aucune fiche validée pour l\'instant.' }));
      liste.forEach(function (f) { zone.appendChild(ligneFiche(f, facturationView)); });
    } catch (e) { zone.textContent = e.reseau ? 'Indisponible hors ligne.' : e.message; }
  }

  // ------------------------------------------------------------ tableau de bord général (patron + conducteur)
  async function tableauGeneral() {
    ecran('Tableau de bord', 'Avancement de tous les chantiers', true, 'tdb');
    var zone = h('div', { class: 'muted', text: 'Chargement…' });
    A.view.appendChild(zone);
    try {
      var suivi = await Cloud.suiviChantiers();
      zone.className = '';
      zone.innerHTML = '';
      var tot = suivi.reduce(function (a, t) {
        ['logements', 'valides', 'a_valider', 'anomalies', 'en_cours', 'a_faire', 'fiches_a_valider'].forEach(function (k) { a[k] = (a[k] || 0) + Number(t[k] || 0); });
        return a;
      }, {});
      var pct = tot.logements ? Math.round(tot.valides / tot.logements * 100) : 0;
      zone.appendChild(h('div', { class: 'tiles' }, [
        ['Chantiers', suivi.length, 'navy'], ['Logements', tot.logements || 0, 'navy'], ['Validés', tot.valides || 0, 'ok'],
        ['Fiches à valider', tot.fiches_a_valider || 0, 'royal'], ['Anomalies', tot.anomalies || 0, 'ko'], ['Avancement', pct + ' %', 'royal']
      ].map(function (x) { return h('div', { class: 'tile tile--' + x[2] }, [h('span', { text: x[0] }), h('b', { text: String(x[1]) })]); })));
      var head = h('div', { class: 'section-head' }, [h('h2', { text: 'Avancement par chantier' }),
        h('button', { class: 'btn btn--ghost', text: 'Exporter en Excel', onclick: function () { exporterSuivi(suivi); } })]);
      zone.appendChild(head);
      zone.appendChild(h('div', { class: 'legend' }, STATUTS.map(function (s) { return h('span', { class: 'lg lg--' + cle(s), text: s.charAt(0) + s.slice(1).toLowerCase() }); })));
      if (!suivi.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucun chantier.' }));
      var aujourd = new Date(new Date().toDateString());
      suivi.forEach(function (t) {
        var n = Number(t.logements) || 0;
        var p = n ? Math.round(t.valides / n * 100) : 0;
        var seg = function (v, c) { return v ? h('span', { class: 'barre__s lg--' + c, style: 'width:' + (v / n * 100) + '%', title: v }) : null; };
        var jours = t.prochain_coulage ? Math.round((new Date(t.prochain_coulage) - aujourd) / 86400000) : null;
        var coulage = t.prochain_coulage ? fr(t.prochain_coulage) + (jours === 0 ? ' (aujourd\'hui)' : ' (J-' + jours + ')') : '—';
        var urgent = jours !== null && jours <= 2 && (t.anomalies > 0 || t.a_valider > 0 || t.en_cours > 0);
        zone.appendChild(h('div', { class: 'suivi' }, [
          h('div', { class: 'suivi__tete' }, [h('strong', { text: t.chantier }), h('b', { class: 'suivi__pct', text: p + ' %' })]),
          h('div', { class: 'barre' }, [seg(t.valides, 'ok'), seg(t.a_valider, 'val'), seg(t.anomalies, 'ko'), seg(t.en_cours, 'run'), seg(t.a_faire, 'todo')]),
          h('div', { class: 'suivi__infos' }, [
            h('span', { text: t.valides + ' / ' + n + ' logements validés' }),
            h('span', { class: urgent ? 'urgent' : '', text: 'Prochain coulage : ' + coulage }),
            h('span', { text: t.fiches_a_valider + ' fiche(s) à valider · ' + t.anomalies + ' anomalie(s)' }),
            h('span', { class: 'muted', text: 'Dernière activité : ' + (t.derniere_activite ? new Date(t.derniere_activite).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—') })
          ]),
          h('button', { class: 'chip', text: 'Détail du chantier →', onclick: function () { tableauBord(t.chantier_id); } })
        ]));
      });
    } catch (e) { zone.textContent = e.reseau ? 'Tableau de bord indisponible hors ligne.' : e.message; }
  }
  async function exporterSuivi(suivi) {
    try {
      var wb = new window.ExcelJS.Workbook();
      var ws = wb.addWorksheet('Suivi des chantiers');
      ws.columns = [{ header: 'Chantier', key: 'c', width: 36 }, { header: 'Logements', key: 'n', width: 11 },
        { header: 'Validés', key: 'v', width: 9 }, { header: 'À valider', key: 'av', width: 10 }, { header: 'Anomalies', key: 'a', width: 11 },
        { header: 'En cours', key: 'e', width: 10 }, { header: 'À faire', key: 'f', width: 9 }, { header: 'Avancement', key: 'p', width: 12 },
        { header: 'Prochain coulage', key: 'pc', width: 16 }, { header: 'Fiches à valider', key: 'fv', width: 15 }];
      suivi.forEach(function (t) {
        ws.addRow({ c: t.chantier, n: t.logements, v: t.valides, av: t.a_valider, a: t.anomalies, e: t.en_cours, f: t.a_faire,
          p: t.logements ? t.valides / t.logements : 0, pc: t.prochain_coulage ? new Date(t.prochain_coulage) : null, fv: t.fiches_a_valider });
      });
      ws.getColumn('p').numFmt = '0%';
      ws.getColumn('pc').numFmt = 'dd/mm/yyyy';
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27214E' } };
      var buf = await wb.xlsx.writeBuffer();
      A.telecharger(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        'Suivi_chantiers_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    } catch (e) { A.erreur(e); }
  }

  // détail d'un chantier : tuiles, carte des logements, fiches
  async function tableauBord(chantierId) {
    ecran('Tableau de bord', 'Détail du chantier', true, 'tdb');
    var chs = S.config.chantiers;
    if (!chs.length) { A.view.appendChild(h('p', { class: 'lead', text: 'Aucun chantier accessible.' })); return; }
    etat.chantierId = chantierId || etat.chantierId || chs[0].id;
    A.view.appendChild(choixChantier(etat.chantierId, function (id) { tableauBord(id); }));
    var zone = h('div', { text: 'Chargement…', class: 'muted' });
    A.view.appendChild(zone);
    try {
      var r = await Promise.all([Cloud.tableauBord(), Cloud.logements(etat.chantierId), Cloud.fiches(etat.chantierId)]);
      zone.className = '';
      zone.innerHTML = '';
      dessinerTableau(zone, r[0].filter(function (t) { return t.chantier_id === etat.chantierId; })[0], r[1], r[2]);
    } catch (e) {
      zone.textContent = e.reseau ? 'Tableau de bord indisponible hors ligne.' : e.message;
    }
  }
  function dessinerTableau(zone, t, logements, fiches) {
    t = t || { logements: 0, valides: 0, a_valider: 0, anomalies: 0, en_cours: 0, a_faire: 0 };
    var pct = t.logements ? Math.round(t.valides / t.logements * 100) : 0;
    zone.appendChild(h('div', { class: 'tiles' }, [
      ['Logements', t.logements, 'navy'], ['Validés', t.valides, 'ok'], ['À valider', t.a_valider, 'royal'],
      ['Anomalies', t.anomalies, 'ko'], ['En cours', t.en_cours, 'gold'], ['À faire', t.a_faire, 'grey'], ['Avancement', pct + ' %', 'royal']
    ].map(function (x) { return h('div', { class: 'tile tile--' + x[2] }, [h('span', { text: x[0] }), h('b', { text: String(x[1]) })]); })));
    zone.appendChild(h('h2', { text: 'Carte des logements' }));
    zone.appendChild(h('div', { class: 'legend' }, STATUTS.map(function (s) {
      return h('span', { class: 'lg lg--' + cle(s), text: s.charAt(0) + s.slice(1).toLowerCase() });
    })));
    var groupes = [];
    logements.forEach(function (l) {
      var g = groupes[groupes.length - 1];
      if (!g || g.bat !== l.batiment || g.niv !== l.niveau) { g = { bat: l.batiment, niv: l.niveau, lgs: [] }; groupes.push(g); }
      g.lgs.push(l);
    });
    var carte = h('div', { class: 'carte' });
    groupes.forEach(function (g) {
      carte.appendChild(h('div', { class: 'carte__row' }, [h('div', { class: 'carte__lab', text: g.bat + ' · ' + g.niv })]
        .concat(g.lgs.map(function (l) { return h('span', { class: 'lg lg--' + cle(l.statut), title: l.statut, text: l.code }); }))));
    });
    zone.appendChild(carte);
    zone.appendChild(h('h2', { text: 'Fiches (' + fiches.length + ')' }));
    if (!fiches.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucune fiche pour ce chantier.' }));
    var liste = h('div', { class: 'flist' });
    fiches.forEach(function (f) { liste.appendChild(ligneFiche(f, function () { tableauBord(etat.chantierId); })); });
    zone.appendChild(liste);
  }

  // ------------------------------------------------------------ chantiers (registre)
  async function chantiersView() {
    ecran('Chantiers', 'Registre : création, structure, équipes', true, 'chantiers');
    A.view.appendChild(h('button', { class: 'btn btn--primary', text: '+ Nouveau chantier', onclick: function () { chantierEditeur(null); } }));
    var zone = h('div', { class: 'muted', text: 'Chargement…', style: 'margin-top:12px' });
    A.view.appendChild(zone);
    try {
      var liste = await Cloud.chantiersDetail();
      zone.className = 'flist';
      zone.innerHTML = '';
      liste.forEach(function (c) {
        var nbL = 0, resume = (c.batiments || []).map(function (b) {
          var n = (b.niveaux || []).reduce(function (a, x) { return a + x.nb_logements; }, 0); nbL += n;
          return b.nom + ' : ' + (b.niveaux || []).length + ' niv., ' + n + ' logts';
        }).join(' · ');
        zone.appendChild(h('div', { class: 'flist__row' }, [
          h('div', {}, [h('strong', { text: c.nom + (c.actif ? '' : ' (archivé)') }),
            h('div', { class: 'muted', text: [c.adresse, c.debut ? 'du ' + fr(c.debut) : '', c.fin ? 'au ' + fr(c.fin) : ''].filter(Boolean).join(' · ') }),
            h('div', { class: 'muted', text: nbL + ' logements · ' + (resume || 'structure à saisir') })]),
          h('div', { class: 'flist__badges' }, [h('span', { class: 'badge badge--etat', text: (c.affectations || []).length + ' affecté(s)' })]),
          h('div', { class: 'flist__actions' }, [h('button', { class: 'chip', text: 'Modifier', onclick: function () { chantierEditeur(c); } })])
        ]));
      });
    } catch (e) { zone.textContent = e.reseau ? 'Indisponible hors ligne.' : e.message; }
  }

  function parseNiveau(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Math.round(v);
    var s = String(v).trim().toLowerCase();
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/rdc|rez/.test(s)) return 0;
    var d = s.replace(/[^\d]/g, '');
    if (!d) return null;
    return (/-|sous|^ss/.test(s) ? -1 : 1) * parseInt(d, 10);
  }
  // lit un tableau (Excel ou CSV) : colonnes Bâtiment / Niveau / Nb logements, ou une ligne par logement
  function lireStructure(lignes) {
    var hr = -1, cB = -1, cN = -1, cQ = -1, cL = -1;
    for (var r = 0; r < Math.min(15, lignes.length) && hr < 0; r++) {
      cB = cN = cQ = cL = -1;
      lignes[r].forEach(function (v, c) {
        var t = String(v || '').trim().toLowerCase();
        if (!t) return;
        if (cB < 0 && /b[aâ]t|immeuble/.test(t)) cB = c;
        else if (cN < 0 && /niveau|[ée]tage/.test(t)) cN = c;
        else if (cQ < 0 && /\bnb\b|nombre/.test(t)) cQ = c;
        else if (cL < 0 && /logement|lot|appart/.test(t)) cL = c;
      });
      if (cB >= 0 && cN >= 0 && (cQ >= 0 || cL >= 0)) hr = r;
    }
    if (hr < 0) throw new Error('Colonnes introuvables : il faut « Bâtiment », « Niveau » et « Nb logements » (ou une colonne « Logement »).');
    var agg = {}, ordre = [];
    for (var i = hr + 1; i < lignes.length; i++) {
      var b = String(lignes[i][cB] || '').trim(), n = parseNiveau(lignes[i][cN]);
      if (!b || n === null) continue;
      var k = b + '|' + n, q = cQ >= 0 ? parseInt(lignes[i][cQ], 10) || 0 : 1;
      if (!agg[k]) { agg[k] = { batiment: b, num: n, nb: 0 }; ordre.push(k); }
      agg[k].nb += q;
    }
    return ordre.map(function (k) { return agg[k]; }).filter(function (s) { return s.nb > 0; });
  }
  async function lireFichierStructure(fichier) {
    if (/\.csv$/i.test(fichier.name)) {
      var txt = (await fichier.text()).replace(/^﻿/, '');
      var sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
      return lireStructure(txt.split(/\r?\n/).map(function (l) { return l.split(sep); }));
    }
    var wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(await fichier.arrayBuffer());
    var ws = wb.worksheets[0], lignes = [];
    ws.eachRow({ includeEmpty: true }, function (row) {
      var vals = [];
      row.eachCell({ includeEmpty: true }, function (cell, col) {
        var v = cell.value;
        if (v && typeof v === 'object') v = v.result !== undefined ? v.result : (v.text || v.richText && v.richText.map(function (x) { return x.text; }).join('') || '');
        vals[col - 1] = v;
      });
      lignes.push(vals);
    });
    return lireStructure(lignes);
  }

  async function chantierEditeur(c) {
    ecran(c ? 'Modifier le chantier' : 'Nouveau chantier', c ? c.nom : 'Registre', true, 'chantiers');
    A.view.appendChild(h('button', { class: 'btn btn--ghost', text: '← Chantiers', onclick: chantiersView }));
    var profils = [];
    var cible = { id: c && c.id };          // garde l'identifiant créé si un 2e clic suit une erreur
    try { profils = await Cloud.profils(); } catch (e) { /* liste vide */ }
    var champ = function (lab, val, type) {
      var i = h('input', { class: 'input', type: type || 'text', value: val || '' });
      return { el: h('div', { class: 'field' }, [h('label', { text: lab }), i]), input: i };
    };
    var fNom = champ('Nom du chantier', c && c.nom), fAdr = champ('Adresse / commune', c && c.adresse),
      fCli = champ('Client / maître d\'ouvrage', c && c.client), fDeb = champ('Début', c && c.debut, 'date'), fFin = champ('Fin prévue', c && c.fin, 'date');
    var selCond = h('select', { class: 'input' }, [h('option', { value: '', text: '—' })].concat(profils.filter(function (p) { return p.role === 'conducteur' || p.role === 'admin'; })
      .map(function (p) { return h('option', { value: p.id, text: p.nom }); })));
    selCond.value = (c && c.conducteur_id) || (etat.profil.role === 'conducteur' ? etat.profil.id : '');
    var grille = h('div', { class: 'champs2' }, [fNom.el, fAdr.el, fCli.el, h('div', { class: 'field' }, [h('label', { text: 'Conducteur de travaux' }), selCond]), fDeb.el, fFin.el]);
    A.view.appendChild(h('div', { class: 'card' }, [grille]));

    // structure
    var structure = [];
    (c && c.batiments || []).slice().sort(function (a, b) { return a.ordre - b.ordre; }).forEach(function (b) {
      (b.niveaux || []).slice().sort(function (x, y) { return x.num - y.num; }).forEach(function (n) { structure.push({ bid: b.id, batiment: b.nom, num: n.num, nb: n.nb_logements }); });
    });
    var tbl = h('div', { class: 'struct' });
    function dessinerStructure() {
      tbl.innerHTML = '';
      tbl.appendChild(h('div', { class: 'struct__h' }, [h('span', { text: 'Bâtiment' }), h('span', { text: 'N° niveau (0 = RDC)' }), h('span', { text: 'Nb logements' }), h('span', { text: 'Codes' }), h('span')]));
      structure.forEach(function (s, i) {
        var bi = h('input', { class: 'input', value: s.batiment, oninput: function (e) { s.batiment = e.target.value; } });
        var ni = h('input', { class: 'input', type: 'number', min: -3, max: 60, value: s.num, oninput: function (e) { s.num = parseInt(e.target.value, 10); dessinerCodes(); } });
        var qi = h('input', { class: 'input', type: 'number', min: 1, max: 99, value: s.nb, oninput: function (e) { s.nb = parseInt(e.target.value, 10); dessinerCodes(); } });
        var codes = h('span', { class: 'muted' });
        function dessinerCodes() {
          codes.textContent = isNaN(s.num) || !s.nb ? '' : window.FicheXlsx.niveauLabel(s.num) + ' : ' + window.FicheXlsx.codeLogement(s.num, 1) + (s.nb > 1 ? ' → ' + window.FicheXlsx.codeLogement(s.num, s.nb) : '');
        }
        dessinerCodes();
        tbl.appendChild(h('div', { class: 'struct__r' }, [bi, ni, qi, codes,
          h('button', { class: 'chip', text: '✕', 'aria-label': 'Retirer', onclick: function () { structure.splice(i, 1); dessinerStructure(); } })]));
      });
    }
    dessinerStructure();
    var fichier = h('input', { type: 'file', accept: '.xlsx,.csv', hidden: true, onchange: async function (e) {
      var f = e.target.files[0]; if (!f) return;
      try {
        var lu = await lireFichierStructure(f);
        if (!lu.length) throw new Error('Aucune ligne exploitable.');
        if (structure.length && !confirm(lu.length + ' niveau(x) trouvé(s). Remplacer la structure actuelle ?')) return;
        structure = lu; dessinerStructure(); A.toast(lu.length + ' niveau(x) importé(s) : vérifiez puis enregistrez.');
      } catch (err) { A.erreur(err); }
      e.target.value = '';
    } });
    A.view.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'section-head' }, [h('strong', { text: 'Structure : une ligne par niveau' }),
        h('div', { class: 'chips' }, [
          h('button', { class: 'chip', text: '+ Ajouter un niveau', onclick: function () {
            var der = structure[structure.length - 1];
            structure.push({ batiment: der ? der.batiment : 'Bât A', num: der ? der.num + 1 : 0, nb: der ? der.nb : 1 }); dessinerStructure();
          } }),
          h('button', { class: 'chip', text: 'Importer un fichier Excel / CSV', onclick: function () { fichier.click(); } }),
          h('button', { class: 'chip', text: 'Lire un document (photo / PDF)', onclick: function () {
            A.toast('Prochaine étape : lecture automatique d\'un plan ou d\'une liste des lots (photo / PDF) par intelligence artificielle. En attendant : import Excel / CSV ou saisie.', 6000);
          } })
        ])]),
      h('p', { class: 'muted', text: 'Fichier accepté : colonnes « Bâtiment », « Niveau » (0, RDC, R+2, 2e étage…), « Nb logements » — ou une ligne par logement avec une colonne « Logement » / « Lot ».' }),
      tbl, fichier
    ]));

    // équipe affectée
    var affectes = (c && c.affectations || []).map(function (a) { return a.profile_id; });
    var cases = profils.filter(function (p) { return p.role === 'chef_chantier' || p.role === 'compagnon'; }).map(function (p) {
      var cb = h('input', { type: 'checkbox' }); cb.checked = affectes.indexOf(p.id) >= 0; cb.dataset.id = p.id;
      return h('label', { class: 'chip' }, [cb, ' ' + p.nom + ' (' + (ROLES[p.role] || p.role) + ')']);
    });
    A.view.appendChild(h('div', { class: 'card' }, [h('strong', { text: 'Équipe affectée (accès au chantier dans l\'appli)' }),
      h('div', { class: 'chips', style: 'margin-top:8px' }, cases.length ? cases : [h('span', { class: 'muted', text: 'Aucun compte chef / compagnon : créez-les dans l\'onglet Équipe.' })])]));

    var btn = h('button', { class: 'btn btn--primary btn--block', text: 'Enregistrer le chantier', onclick: async function () {
      var nom = fNom.input.value.trim();
      if (!nom) { A.toast('Nom du chantier obligatoire.'); return; }
      var propre = structure.filter(function (s) { return s.batiment && !isNaN(s.num) && s.nb > 0; });
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        cible.nom = nom;
        var res = await Cloud.sauverChantier(Object.assign(cible, { nom: nom, adresse: fAdr.input.value, client: fCli.input.value,
          debut: fDeb.input.value, fin: fFin.input.value, conducteur_id: selCond.value || null }),
          propre, cases.map(function (l) { return l.querySelector('input'); }).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.id; }));
        await rafraichirRegistre();
        A.toast('Chantier enregistré.' + (res.avertissements.length ? ' ' + res.avertissements.join(' ; ') : ''), 5000);
        chantiersView();
      } catch (e) { A.erreur(e); btn.disabled = false; btn.textContent = 'Enregistrer le chantier'; }
    } });
    A.view.appendChild(btn);
  }

  // ------------------------------------------------------------ équipe : registre des salariés + comptes
  function motDePasse() {
    var a = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(10));
    return 'ES-' + Array.prototype.map.call(b, function (x) { return a[x % a.length]; }).join('');
  }
  function suggererIdentifiant(nom) {
    var p = String(nom).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
    return p.length > 1 ? p[0] + '.' + p[p.length - 1].charAt(0) : (p[0] || '');
  }

  async function equipeView() {
    ecran('Équipe', 'Salariés et comptes de connexion', true, 'equipe');
    var zone = h('div', { class: 'muted', text: 'Chargement…' });
    A.view.appendChild(zone);
    try {
      var pers = await Cloud.personnel();
      zone.className = '';
      zone.innerHTML = '';
      // registre des salariés
      var reg = h('div', { class: 'card' }, [h('div', { class: 'section-head' }, [h('strong', { text: 'Registre des salariés (noms proposés dans les fiches)' }),
        h('button', { class: 'chip', text: '+ Ajouter un salarié', onclick: function () { pers.unshift({ nom: '', fonction: 'compagnon', actif: true }); dessiner(); } })])]);
      var lst = h('div', { class: 'flist' });
      reg.appendChild(lst);
      function dessiner() {
        lst.innerHTML = '';
        pers.forEach(function (p) {
          var n = h('input', { class: 'input', value: p.nom || '', placeholder: 'Prénom NOM' });
          var f = h('select', { class: 'input' }, Object.keys(FONCTIONS).map(function (k) { return h('option', { value: k, text: FONCTIONS[k] }); }));
          f.value = p.fonction;
          var t = h('input', { class: 'input', type: 'tel', value: p.telephone || '', placeholder: 'Téléphone' });
          var a = h('input', { type: 'checkbox' }); a.checked = p.actif !== false;
          lst.appendChild(h('div', { class: 'flist__row flist__row--4' }, [n, f, t,
            h('div', { class: 'flist__actions' }, [h('label', { class: 'muted' }, [a, ' actif']),
              h('button', { class: 'chip', text: 'Enregistrer', onclick: async function () {
                if (!n.value.trim()) { A.toast('Nom obligatoire.'); return; }
                try { var r = await Cloud.sauverPersonne({ id: p.id, nom: n.value.trim(), fonction: f.value, telephone: t.value, actif: a.checked });
                  p.id = r.id; await rafraichirRegistre(); A.toast('Salarié enregistré.'); } catch (e) { A.erreur(e); }
              } })])]));
        });
      }
      dessiner();
      zone.appendChild(reg);
      if (peut(['admin'])) zone.appendChild(await blocComptes());
    } catch (e) { zone.textContent = e.reseau ? 'Indisponible hors ligne.' : e.message; }
  }

  async function blocComptes() {
    var carte = h('div', { class: 'card' }, [h('strong', { text: 'Comptes de connexion (identifiant + mot de passe)' })]);
    var comptes = await Cloud.comptes();
    var lst = h('div', { class: 'flist', style: 'margin-top:8px' });
    comptes.forEach(function (c) {
      var sel = h('select', { class: 'input' }, Object.keys(ROLES).map(function (r) { return h('option', { value: r, text: ROLES[r] }); }));
      sel.value = c.role;
      var act = h('input', { type: 'checkbox' }); act.checked = c.actif;
      lst.appendChild(h('div', { class: 'flist__row flist__row--4' }, [
        h('div', {}, [h('strong', { text: c.nom }), h('div', { class: 'muted', text: 'Identifiant : ' + c.identifiant +
          (c.last_sign_in_at ? ' · dernière connexion ' + new Date(c.last_sign_in_at).toLocaleDateString('fr-FR') : ' · jamais connecté') })]),
        sel, h('label', { class: 'muted' }, [act, ' actif']),
        h('div', { class: 'flist__actions' }, [
          h('button', { class: 'chip', text: 'Enregistrer', onclick: async function () {
            try { await Cloud.modifierProfil({ id: c.id, nom: c.nom, role: sel.value, actif: act.checked }); A.toast('Compte mis à jour.'); } catch (e) { A.erreur(e); }
          } }),
          h('button', { class: 'chip', text: 'Nouveau mot de passe', onclick: async function () {
            var mdp = prompt('Nouveau mot de passe pour ' + c.nom + ' (8 caractères minimum) :', motDePasse());
            if (!mdp) return;
            try { await Cloud.changerMotDePasse(c.id, mdp); alert('Mot de passe changé.\n\nIdentifiant : ' + c.identifiant + '\nMot de passe : ' + mdp + '\n\nÀ communiquer à ' + c.nom + '.'); } catch (e) { A.erreur(e); }
          } })
        ])]));
    });
    carte.appendChild(lst);
    // création
    var nom = h('input', { class: 'input', placeholder: 'Prénom NOM' });
    var ident = h('input', { class: 'input', placeholder: 'ex. karim.b', autocapitalize: 'none' });
    nom.addEventListener('input', function () { if (!ident.dataset.touche) ident.value = suggererIdentifiant(nom.value); });
    ident.addEventListener('input', function () { ident.dataset.touche = '1'; });
    var role = h('select', { class: 'input' }, Object.keys(ROLES).map(function (r) { return h('option', { value: r, text: ROLES[r] }); }));
    role.value = 'compagnon';
    var mdp = h('input', { class: 'input', value: motDePasse() });
    var aussi = h('input', { type: 'checkbox' }); aussi.checked = true;
    carte.appendChild(h('h2', { text: 'Créer un compte' }));
    carte.appendChild(h('div', { class: 'champs2' }, [
      h('div', { class: 'field' }, [h('label', { text: 'Nom' }), nom]), h('div', { class: 'field' }, [h('label', { text: 'Identifiant' }), ident]),
      h('div', { class: 'field' }, [h('label', { text: 'Profil' }), role]), h('div', { class: 'field' }, [h('label', { text: 'Mot de passe attribué' }), mdp])]));
    carte.appendChild(h('label', { class: 'muted' }, [aussi, ' Ajouter aussi au registre des salariés (chefs et compagnons)']));
    carte.appendChild(h('button', { class: 'btn btn--primary btn--block', style: 'margin-top:10px', text: 'Créer le compte', onclick: async function () {
      try {
        await Cloud.creerCompte({ identifiant: ident.value, nom: nom.value, role: role.value, mdp: mdp.value });
        if (aussi.checked && (role.value === 'chef_chantier' || role.value === 'compagnon')) {
          try { await Cloud.sauverPersonne({ nom: nom.value.trim(), fonction: role.value, actif: true }); } catch (e) { /* déjà présent */ }
        }
        alert('Compte créé.\n\nIdentifiant : ' + ident.value.trim().toLowerCase() + '\nMot de passe : ' + mdp.value +
          '\n\nÀ communiquer à ' + nom.value + '. La connexion restera mémorisée sur son téléphone.');
        equipeView();
      } catch (e) { A.erreur(e); }
    } }));
    return carte;
  }

  // ------------------------------------------------------------ plans
  async function plansView(chantierId, depuisFiche) {
    ecran('Plans', 'Consulter les plans du chantier', true, depuisFiche ? null : 'plans');
    if (depuisFiche) A.view.appendChild(h('button', { class: 'btn btn--gold', text: '← Revenir à la fiche', onclick: function () { A.go(S.step); } }));
    if (!S.config.chantiers.length) { A.view.appendChild(h('p', { class: 'lead', text: 'Aucun chantier accessible.' })); return; }
    etat.chantierId = chantierId || etat.chantierId || S.config.chantiers[0].id;
    A.view.appendChild(choixChantier(etat.chantierId, function (id) { plansView(id, depuisFiche); }));
    var ch = S.config.chantiers.filter(function (c) { return c.id === etat.chantierId; })[0];
    var zone = h('div', { class: 'muted', text: 'Chargement…' });
    var visionneuse = h('div', { class: 'visio', hidden: true });
    if (peut(['admin', 'conducteur'])) A.view.appendChild(formulairePlan(ch));
    A.view.appendChild(zone);
    A.view.appendChild(visionneuse);
    try {
      var liste = await Cloud.plans(etat.chantierId);
      zone.className = 'flist';
      zone.innerHTML = '';
      if (!liste.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucun plan pour ce chantier.' }));
      var nomNiv = {}, nomBat = {};
      ch.batiments.forEach(function (b) { nomBat[b.id] = b.nom; b.niveaux.forEach(function (n) { nomNiv[n.id] = b.nom + ' · ' + window.FicheXlsx.niveauLabel(n.num); }); });
      liste.forEach(function (p) {
        var actions = h('div', { class: 'flist__actions' }, [h('button', { class: 'chip chip--ok', text: 'Ouvrir', onclick: function () { ouvrirPlan(p, visionneuse); } })]);
        if (peut(['admin', 'conducteur'])) actions.appendChild(h('button', { class: 'chip', text: 'Supprimer', onclick: async function () {
          if (!confirm('Supprimer le plan « ' + p.titre + ' » ?')) return;
          try { await Cloud.supprimerPlan(p); plansView(etat.chantierId, depuisFiche); } catch (e) { A.erreur(e); }
        } }));
        zone.appendChild(h('div', { class: 'flist__row' }, [
          h('div', {}, [h('strong', { text: p.titre }), h('div', { class: 'muted', text: (nomNiv[p.niveau_id] || nomBat[p.batiment_id] || 'Tout le chantier') +
            ' · ' + (p.type_mime === 'application/pdf' ? 'PDF' : 'image') + ' · ' + new Date(p.created_at).toLocaleDateString('fr-FR') })]),
          h('span'), actions]));
      });
    } catch (e) { zone.textContent = e.reseau ? 'Plans indisponibles hors ligne.' : e.message; }
  }
  async function ouvrirPlan(p, visionneuse) {
    var fen = p.type_mime === 'application/pdf' && window.innerWidth < 900 ? window.open('', '_blank') : null;
    try {
      var url = await Cloud.urlPlan(p);
      if (fen) { fen.location = url; return; }
      visionneuse.hidden = false;
      visionneuse.innerHTML = '';
      var zoom = 1;
      var contenu = p.type_mime === 'application/pdf'
        ? h('iframe', { src: url, title: p.titre, class: 'visio__pdf' })
        : h('img', { src: url, alt: p.titre, class: 'visio__img' });
      var cadre = h('div', { class: 'visio__cadre' }, [contenu]);
      function appliquer() { if (contenu.tagName === 'IMG') contenu.style.width = (zoom * 100) + '%'; }
      visionneuse.appendChild(h('div', { class: 'section-head' }, [h('strong', { text: p.titre }), h('div', { class: 'chips' }, [
        contenu.tagName === 'IMG' ? h('button', { class: 'chip', text: '−', onclick: function () { zoom = Math.max(0.5, zoom - 0.25); appliquer(); } }) : null,
        contenu.tagName === 'IMG' ? h('button', { class: 'chip', text: '+', onclick: function () { zoom = Math.min(4, zoom + 0.25); appliquer(); } }) : null,
        h('a', { class: 'chip', href: url, target: '_blank', rel: 'noopener', text: 'Plein écran' }),
        h('button', { class: 'chip', text: 'Fermer', onclick: function () { visionneuse.hidden = true; visionneuse.innerHTML = ''; } })])]));
      visionneuse.appendChild(cadre);
      visionneuse.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { if (fen) fen.close(); A.erreur(e); }
  }
  function formulairePlan(ch) {
    var fichier = h('input', { type: 'file', accept: 'application/pdf,image/*', class: 'input' });
    var titre = h('input', { class: 'input', placeholder: 'ex. Plan réseaux R+2' });
    var cible = h('select', { class: 'input' }, [h('option', { value: '', text: 'Tout le chantier' })].concat(
      ch.batiments.reduce(function (a, b) {
        a.push(h('option', { value: 'b:' + b.id, text: b.nom }));
        b.niveaux.forEach(function (n) { a.push(h('option', { value: 'n:' + b.id + ':' + n.id, text: '   ' + b.nom + ' · ' + window.FicheXlsx.niveauLabel(n.num) })); });
        return a;
      }, [])));
    var btn = h('button', { class: 'btn btn--primary', text: 'Ajouter le plan', onclick: async function () {
      var f = fichier.files[0];
      if (!f) { A.toast('Choisissez un fichier (PDF ou image).'); return; }
      var v = cible.value.split(':');
      btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        await Cloud.ajouterPlan(ch.id, f, titre.value.trim() || f.name, v[0] ? v[1] : null, v[0] === 'n' ? v[2] : null);
        A.toast('Plan ajouté.'); plansView(ch.id);
      } catch (e) { A.erreur(e); btn.disabled = false; btn.textContent = 'Ajouter le plan'; }
    } });
    return h('div', { class: 'card' }, [h('strong', { text: 'Ajouter un plan (PDF ou image, 20 Mo max.)' }),
      h('div', { class: 'champs2', style: 'margin-top:8px' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Fichier' }), fichier]), h('div', { class: 'field' }, [h('label', { text: 'Titre' }), titre]),
        h('div', { class: 'field' }, [h('label', { text: 'Bâtiment / niveau' }), cible])]), btn]);
  }
  function boutonPlansFiche() {
    var c = S.config.chantiers.filter(function (x) { return x.nom === S.fiche.chantier; })[0];
    if (!c) return null;
    return h('button', { class: 'btn btn--ghost btn--block', style: 'margin-top:14px', text: '🗺  Voir les plans du chantier', onclick: function () { plansView(c.id, true); } });
  }

  // ------------------------------------------------------------ guide
  function guideView() {
    ecran('Guide', 'Comment remplir la fiche', true, 'guide');
    var C = S.contenu;
    A.view.appendChild(h('div', { class: 'rappels' }, [h('strong', { text: 'À vérifier avant chaque envoi' }),
      h('ul', {}, C.rappels.map(function (t) { return h('li', { text: t }); }))]));
    C.sections.forEach(function (s) {
      var g = C.guide[String(s.n)];
      if (!g) return;
      A.view.appendChild(h('div', { class: 'card' }, [
        h('h2', { text: s.n + '. ' + s.titre.charAt(0) + s.titre.slice(1).toLowerCase() }),
        h('strong', { text: 'Comment faire' }), h('ul', {}, g.faire.map(function (t) { return h('li', { text: t }); })),
        h('strong', { text: 'Attention' }), h('ul', { class: 'guide__att' }, g.attention.map(function (t) { return h('li', { text: t }); })),
        s.alerte ? h('div', { class: 'alert', text: '⚠ ' + s.alerte }) : null
      ]));
    });
    A.view.appendChild(h('div', { class: 'card' }, [h('h2', { text: 'Repères' }), h('ul', {}, [
      h('li', { text: 'Numéro de logement : niveau sur 2 chiffres + n° (RDC : 001, 002… · R+2 : 021, 022…). 6 logements maximum par fiche : au-delà, « + Fiche suivante ».' }),
      h('li', { text: 'Les carrés d\'étapes en haut de la fiche permettent de revenir directement à une étape.' }),
      h('li', { text: 'Sans réseau : la fiche est gardée sur le téléphone et part toute seule au retour du réseau. Le mail reste possible en secours.' }),
      h('li', { text: 'Une fiche validée par le chef est verrouillée : pour corriger, on fait une nouvelle fiche.' }),
      h('li', { text: 'Carte des logements : vert validé · bleu à valider · rouge anomalie · jaune en cours · gris à faire.' })
    ])]));
  }

  window.Plateforme = { actif: actif, demarrer: demarrer, home: home, boutonEnvoiServeur: boutonEnvoiServeur,
    tableauBord: tableauBord, plansView: plansView, boutonPlansFiche: boutonPlansFiche, guideView: guideView };
})();
