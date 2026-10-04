/*
 * Euro Sanichauff – interface du mode connecté (Projet 4)
 * Connexion persistante, accueil selon le profil, boîte d'envoi, tableau de bord « Bureau », administration.
 * S'appuie sur app.js (window.ESApp) et cloud.js (window.Cloud).
 */
(function () {
  'use strict';

  var ROLES = { admin: 'Administrateur', conducteur: 'Conducteur de travaux', chef_chantier: 'Chef de chantier',
    compagnon: 'Compagnon', facturation: 'Facturation' };
  var STATUTS = ['VALIDÉ', 'À VALIDER', 'ANOMALIE', 'EN COURS', 'À FAIRE'];
  var A, S, h;                       // raccourcis vers app.js
  var etat = { profil: null, horsLigne: false, chantierId: null };

  function actif() { return !!(window.Cloud && window.Cloud.actif); }
  function peut(roles) { return etat.profil && roles.indexOf(etat.profil.role) >= 0; }
  function ecran(titre, sous, large) {
    A.nav.hidden = true;
    document.getElementById('progress').hidden = true;
    A.view.innerHTML = '';
    A.view.className = 'view' + (large ? ' view--wide' : '');
    A.title(titre, sous);
  }
  function retourAccueil() { return h('button', { class: 'btn btn--ghost', text: '← Accueil', onclick: home }); }
  function bandeauEnv() {
    var env = (window.ES_CONFIG || {}).environnement;
    return env && env !== 'production' ? h('div', { class: 'banner banner--env', text: 'Version de ' + env + ' – données de démonstration' }) : null;
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
    var s = null;
    try { s = await Cloud.session(); } catch (e) { /* hors ligne */ }
    if (!s) { connexionView(); return; }
    await charger();
  }

  async function charger() {
    ecran('Chargement…', '');
    try {
      etat.profil = await Cloud.profil();
      var reg = await Cloud.registre();
      S.config = reg.cfg;
      etat.horsLigne = !reg.enLigne;
      home();
      synchro(false);
    } catch (e) {
      A.toast(e.message || 'Erreur de connexion', 5000);
      if (!e.reseau) { await Cloud.deconnexion(); connexionView(); }
    }
  }

  function connexionView() {
    ecran('Connexion', 'Fiches chantier');
    var email = h('input', { class: 'input', type: 'email', id: 'lg_email', autocomplete: 'username', placeholder: 'prenom.nom@…' });
    var mdp = h('input', { class: 'input', type: 'password', id: 'lg_mdp', autocomplete: 'current-password' });
    var btn = h('button', { class: 'btn btn--primary btn--block', text: 'Se connecter', onclick: go });
    async function go() {
      if (!email.value || !mdp.value) { A.toast('Email et mot de passe obligatoires.'); return; }
      btn.disabled = true; btn.textContent = 'Connexion…';
      try { await Cloud.connexion(email.value, mdp.value); await charger(); }
      catch (e) { A.toast(e.message, 5000); btn.disabled = false; btn.textContent = 'Se connecter'; }
    }
    mdp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    A.view.appendChild(h('div', { class: 'home-hero' }, [h('img', { src: 'icons/logo.png', alt: 'Euro Sanichauff' })]));
    var b = bandeauEnv(); if (b) A.view.appendChild(b);
    A.view.appendChild(h('div', { class: 'card login' }, [
      h('div', { class: 'field' }, [h('label', { text: 'Email', for: 'lg_email' }), email]),
      h('div', { class: 'field' }, [h('label', { text: 'Mot de passe', for: 'lg_mdp' }), mdp]),
      btn,
      h('p', { class: 'muted', text: 'Vous restez connecté sur cet appareil. Comptes créés par le bureau ; mot de passe oublié : contactez le bureau.' })
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
        h('button', { class: 'chip', text: 'Retirer', onclick: async function () {
          if (confirm('Retirer cette fiche de la boîte d\'envoi ? (elle reste dans « Fiches envoyées » et peut partir par mail)')) {
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
    if (!peut(['facturation'])) {
      st.appendChild(h('button', { class: 'btn btn--primary btn--block', text: '+ Nouvelle fiche', onclick: function () {
        S.fiche = A.nouvelleFiche(); A.go(0);
      } }));
      var draft = A.load(A.KEYS.draft, null);
      if (draft && draft.fiche) {
        st.appendChild(h('button', { class: 'btn btn--gold btn--block', text: 'Reprendre la fiche en cours', onclick: function () {
          S.fiche = draft.fiche; A.go(draft.step || 0);
        } }));
      }
    }
    st.appendChild(h('button', { class: 'btn btn--ghost btn--block', text: 'Tableau de bord des chantiers', onclick: function () { tableauBord(); } }));
    if (!peut(['facturation'])) st.appendChild(h('button', { class: 'btn btn--ghost btn--block', text: 'Mes fiches (cet appareil)', onclick: A.historyView }));
    if (peut(['admin'])) st.appendChild(h('button', { class: 'btn btn--ghost btn--block', text: 'Administration des comptes', onclick: adminView }));
    st.appendChild(h('button', { class: 'btn btn--ghost btn--block', text: 'Paramètres (mail de secours)', onclick: A.settingsView }));
    st.appendChild(h('button', { class: 'btn btn--danger btn--block', text: 'Se déconnecter', onclick: deconnexion }));
    A.view.appendChild(st);
    A.view.appendChild(h('p', { class: 'muted', style: 'text-align:center;margin-top:20px',
      text: S.config.chantiers.length + ' chantier(s) accessible(s)' + (S.config.maj ? ' · registre du ' + new Date(S.config.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '') }));
  }

  async function deconnexion() {
    var o = await Cloud.outbox();
    if (o.length && !confirm(o.length + ' fiche(s) pas encore envoyée(s). Elles resteront sur cet appareil. Se déconnecter quand même ?')) return;
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
        S.fiche = A.nouvelleFiche(f); A.go(3);
      } }),
      !recue ? h('button', { class: 'btn btn--ghost btn--block', text: 'Envoyer par mail (secours)', onclick: function () {
        S.fiche = f; A.go(A.steps().length - 1);
      } }) : null,
      h('button', { class: 'btn btn--ghost btn--block', text: 'Accueil', onclick: home })
    ]));
  }

  // ------------------------------------------------------------ tableau de bord « Bureau »
  async function tableauBord(chantierId) {
    ecran('Tableau de bord', 'Chantiers en cours', true);
    A.view.appendChild(retourAccueil());
    var chs = S.config.chantiers;
    if (!chs.length) { A.view.appendChild(h('p', { class: 'lead', text: 'Aucun chantier accessible.' })); return; }
    etat.chantierId = chantierId || etat.chantierId || chs[0].id;
    var choix = h('div', { class: 'chips', style: 'margin:12px 0' }, chs.map(function (c) {
      return h('button', { class: 'chip', 'aria-pressed': String(c.id === etat.chantierId), text: c.nom,
        onclick: function () { tableauBord(c.id); } });
    }));
    A.view.appendChild(choix);
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

    var head = h('div', { class: 'section-head' }, [h('h2', { text: 'Fiches (' + fiches.length + ')' })]);
    if (peut(['facturation', 'admin'])) {
      var afact = fiches.filter(function (f) { return f.etat === 'validee' && !f.facturee_le; });
      if (afact.length) head.appendChild(h('button', { class: 'btn btn--gold', text: 'Marquer ' + afact.length + ' fiche(s) facturée(s)', onclick: async function () {
        try { var n = await Cloud.marquerFacturee(afact.map(function (f) { return f.id; })); A.toast(n + ' fiche(s) marquée(s) facturée(s).'); tableauBord(); }
        catch (e) { A.erreur(e); }
      } }));
    }
    zone.appendChild(head);
    if (!fiches.length) zone.appendChild(h('p', { class: 'muted', text: 'Aucune fiche pour ce chantier.' }));
    var liste = h('div', { class: 'flist' });
    fiches.forEach(function (f) { liste.appendChild(ligneFiche(f)); });
    zone.appendChild(liste);
  }

  function cle(s) {
    return { 'VALIDÉ': 'ok', 'À VALIDER': 'val', 'ANOMALIE': 'ko', 'EN COURS': 'run', 'À FAIRE': 'todo' }[s] || 'todo';
  }

  function ligneFiche(f) {
    var etatTxt = { soumise: 'Soumise', validee: 'Validée', remplacee: 'Remplacée' }[f.etat] || f.etat;
    var actions = h('div', { class: 'flist__actions' }, [
      h('button', { class: 'chip', text: 'Excel', onclick: function () { exporterExcel(f); } })
    ]);
    if (f.etat === 'soumise' && f.resultat === 'COMPLÈTE' && peut(['chef_chantier', 'conducteur', 'admin'])) {
      actions.appendChild(h('button', { class: 'chip chip--ok', text: 'Valider', onclick: async function () {
        if (!confirm('Valider la fiche ' + f.batiment + ' · ' + f.niveau + ' · ' + f.logements.join(' ') + ' ? Elle ne pourra plus être modifiée.')) return;
        try { await Cloud.valider(f.id); A.toast('Fiche validée et verrouillée.'); tableauBord(); } catch (e) { A.erreur(e); }
      } }));
    }
    return h('div', { class: 'flist__row' }, [
      h('div', {}, [
        h('strong', { text: f.batiment + ' · ' + f.niveau + ' · Log. ' + f.logements.join(' ') }),
        h('div', { class: 'muted', text: window.FicheXlsx.frDate(f.date_fiche) + ' · coulage ' + window.FicheXlsx.frDate(f.coulage) +
          ' · ' + (f.auteur || '—') + (f.validee_par_nom ? ' · validée par ' + f.validee_par_nom : '') +
          (f.facturee_le ? ' · facturée le ' + new Date(f.facturee_le).toLocaleDateString('fr-FR') : '') })
      ]),
      h('div', { class: 'flist__badges' }, [A.badge(f.resultat), h('span', { class: 'badge badge--etat', text: etatTxt })]),
      actions
    ]);
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

  // ------------------------------------------------------------ administration des comptes
  async function adminView() {
    ecran('Administration', 'Comptes et profils', true);
    A.view.appendChild(retourAccueil());
    A.view.appendChild(h('p', { class: 'muted', text: 'Créer un compte : tableau de bord Supabase > Authentication > « Add user » (en développement : http://127.0.0.1:54323). Le compte apparaît ici comme « Compagnon » : choisir son profil puis Enregistrer. Un compte désactivé est coupé immédiatement.' }));
    var zone = h('div', { class: 'flist' });
    A.view.appendChild(zone);
    try {
      (await Cloud.profils()).forEach(function (p) {
        var sel = h('select', { class: 'input' }, Object.keys(ROLES).map(function (r) { return h('option', { value: r, text: ROLES[r] }); }));
        sel.value = p.role;
        var act = h('input', { type: 'checkbox' });
        act.checked = p.actif;
        zone.appendChild(h('div', { class: 'flist__row' }, [
          h('strong', { text: p.nom }), sel,
          h('label', { class: 'muted' }, [act, ' actif']),
          h('button', { class: 'chip', text: 'Enregistrer', onclick: async function () {
            try { await Cloud.modifierProfil({ id: p.id, nom: p.nom, role: sel.value, actif: act.checked }); A.toast('Profil mis à jour.'); }
            catch (e) { A.erreur(e); }
          } })
        ]));
      });
    } catch (e) { zone.textContent = e.message; }
  }

  window.Plateforme = { actif: actif, demarrer: demarrer, home: home, boutonEnvoiServeur: boutonEnvoiServeur, tableauBord: tableauBord };
})();
