/*
 * Euro Sanichauff – appli V2 : connexion au serveur (ADR-0011, ADR-0012, ADR-0013).
 * Reprise de app/js/cloud.js (v1.3, audité le 04/10/2026), adaptée à la fiche V2 :
 * gabarit 2 (27 points), note sous une anomalie, indice du plan, conducteur et plans des chantiers.
 * Session persistante, registre en cache (hors ligne), boîte d'envoi IndexedDB, appels serveur.
 * Inactif si js/config.js ne définit pas l'adresse du serveur : l'appli reste alors en mode « local » (Projet 3).
 * Revu après l'audit ECC (04/10/2026) : ouverture hors ligne, file d'envoi jamais bloquée, versions, déconnexion propre.
 */
(function (root) {
  'use strict';

  var CFG = root.ES_CONFIG || {};
  var actif = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && root.supabase && root.idbKeyval);
  var idb = root.idbKeyval;
  // préfixe propre à l'environnement (es2_ production, es2t_ test, es2d_ local) : l'appli v1, l'appli de test et la vraie
  // appli sont sur le même site ; aucune ne doit toucher la session, les fiches ou le brouillon d'une autre
  var P = (root.ES_CONFIG && root.ES_CONFIG.prefixe) || 'es2_';
  var K = { outbox: P + 'outbox', registre: P + 'registre', profil: P + 'profil' };
  var DELAI_MS = 45000;

  // chaque appel réseau est limité dans le temps (réseau de chantier instable)
  function fetchAvecDelai(url, opts) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, DELAI_MS);
    opts = Object.assign({}, opts || {});
    if (opts.signal) opts.signal.addEventListener('abort', function () { ctrl.abort(); });
    opts.signal = ctrl.signal;
    return fetch(url, opts).finally(function () { clearTimeout(t); });
  }
  var sb = actif ? root.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: P + 'auth', detectSessionInUrl: false },
    global: { fetch: fetchAvecDelai }
  }) : null;
  var ecouteurs = [];
  var syncCourante = null;          // verrou : une seule synchronisation à la fois

  // ------------------------------------------------------------ erreurs lisibles
  function estReseau(err) {
    var m = (err && (err.message || String(err))) || '';
    return /Failed to fetch|NetworkError|Load failed|network|fetch|abort/i.test(m) || (err && err.status === 0) ||
      (err && err.name === 'AbortError');
  }
  function estSession(err) {
    var m = (err && (err.message || String(err))) || '';
    return /JWT|refresh token|session|PGRST30/i.test(m);
  }
  function traduire(err) {
    if (!err) return new Error('Erreur inconnue');
    var m = err.message || String(err);
    if (/Invalid login credentials/i.test(m)) m = 'Identifiant ou mot de passe incorrect.';
    else if (/Email not confirmed/i.test(m)) m = 'Compte non activé : contactez le bureau.';
    else if (estReseau(err)) m = 'Pas de connexion au serveur.';
    else if (estSession(err)) m = 'Session expirée : reconnectez-vous.';
    var e = new Error(m);
    e.code = err.code;
    e.hint = err.hint;
    e.reseau = estReseau(err);
    e.session = estSession(err);
    return e;
  }
  function verifier(r) { if (r.error) throw traduire(r.error); return r.data; }

  // ------------------------------------------------------------ session / profil
  async function session() {
    if (!sb) return null;
    try { var r = await sb.auth.getSession(); return r.data && r.data.session; } catch (e) { return null; }
  }
  function sessionStockee() {
    try { return !!localStorage.getItem(P + 'auth'); } catch (e) { return false; }
  }
  // 'ok' : connecté · 'hors_ligne' : session gardée sur l'appareil mais serveur injoignable · 'absente' : se connecter
  async function etatSession() {
    if (!sb) return 'absente';
    var r;
    try { r = await sb.auth.getSession(); } catch (e) { r = { error: e }; }
    if (r && r.data && r.data.session) return 'ok';
    if (!sessionStockee()) return 'absente';
    if (!navigator.onLine || (r && r.error && estReseau(r.error))) return 'hors_ligne';
    // en ligne mais rafraîchissement refusé : on vérifie une fois de plus avant de demander la reconnexion
    try { var u = await sb.auth.refreshSession(); if (u.data && u.data.session) return 'ok'; if (u.error && estReseau(u.error)) return 'hors_ligne'; }
    catch (e) { if (estReseau(e)) return 'hors_ligne'; }
    return 'absente';
  }
  // identifiant simple (ex. « karim.b ») -> adresse technique ; une vraie adresse mail reste acceptée
  var DOMAINE = 'fiches.euro-sanichauff.fr';
  function versCourriel(identifiant) {
    var s = String(identifiant).trim().toLowerCase();
    if (s.indexOf('@') >= 0) return s;
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.');
    return s + '@' + DOMAINE;
  }
  async function connexion(identifiant, mdp) {
    var r = await sb.auth.signInWithPassword({ email: versCourriel(identifiant), password: mdp });
    if (r.error) throw traduire(r.error);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* facultatif */ });
    return r.data.session;
  }
  // déconnexion : rien ne reste sur un téléphone partagé (fiches non envoyées incluses, après confirmation côté écran)
  // efface les données de l'appli gardées sur le téléphone (fiches en attente, brouillon, photos, cases cochées)
  async function purgerDonneesLocales() {
    var cles = [];
    try { cles = await idb.keys(); } catch (e) { /* ignoré */ }
    for (var i = 0; i < cles.length; i++) {
      if (String(cles[i]).indexOf(P) === 0) { try { await idb.del(cles[i]); } catch (e) { /* ignoré */ } }
    }
    try { ['brouillon', 'preparation', 'dernier_compte'].forEach(function (k) { localStorage.removeItem(P + k); }); } catch (e) { /* ignoré */ }
  }
  async function deconnexion() {
    await desabonnerCeTelephone();                 // un téléphone partagé ne reçoit plus les notifications de ce compte
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* session locale effacée quand même */ }
    try { localStorage.removeItem(P + 'auth'); } catch (e) { /* ignoré */ }
    await purgerDonneesLocales();
    notifier();
  }
  // téléphone partagé (audit lot F) : si un autre compte se connecte, les données du précédent sont effacées
  // AVANT tout envoi, pour qu'aucune fiche ni signature ne passe d'un compte à l'autre
  function dernierCompte() { try { return localStorage.getItem(P + 'dernier_compte'); } catch (e) { return null; } }
  async function verifierProprietaire(profileId) {
    var dernier = dernierCompte(), change = !!dernier && dernier !== profileId;
    if (change) await purgerDonneesLocales();
    try { localStorage.setItem(P + 'dernier_compte', profileId); } catch (e) { /* ignoré */ }
    return change;
  }
  async function profil() {
    try {
      var s = await session();
      if (!s) { var err = new Error('Pas de connexion au serveur.'); err.reseau = true; throw err; }
      var p = verifier(await sb.from('profiles').select('id,nom,role,actif').eq('id', s.user.id).single());
      if (!p.actif) { var d = new Error('Compte désactivé : contactez le bureau.'); d.session = true; throw d; }
      await idb.set(K.profil, p);
      return p;
    } catch (e) {
      var cache = await idb.get(K.profil);
      if (cache && !e.session && !(e.code === 'PGRST116')) { cache.horsLigne = true; return cache; }
      throw e.message ? e : traduire(e);
    }
  }

  // ------------------------------------------------------------ registre (chantiers, structure, personnel)
  function parOrdre(a, b) { return (a.ordre - b.ordre) || String(a.nom).localeCompare(b.nom); }
  async function registre() {
    try {
      if (!(await session())) throw Object.assign(new Error('hors ligne'), { reseau: true });
      var ch = verifier(await sb.from('chantiers')
        .select('id,nom,adresse,actif,conducteur_id,batiments(id,nom,ordre,niveaux(id,num,nb_logements)),plans(id,niveau_id,titre,chemin,indice)')
        .eq('actif', true).order('nom'));
      // nom du conducteur de chaque chantier (affiché dans « La fiche sera envoyée à »)
      var idsConducteurs = ch.map(function (c) { return c.conducteur_id; }).filter(Boolean);
      var conducteurs = {};
      if (idsConducteurs.length) {
        var rp = await sb.from('profiles').select('id,nom').in('id', idsConducteurs);
        (rp.data || []).forEach(function (p) { conducteurs[p.id] = p.nom; });
      }
      var pe = verifier(await sb.from('personnel').select('nom,fonction').eq('actif', true).order('nom'));
      var noms = function (f) { return pe.filter(function (x) { return x.fonction === f; }).map(function (x) { return x.nom; }); };
      var cfg = {
        format: 'eurosanichauff-config', version: 2, source: 'serveur', maj: new Date().toISOString(),
        chantiers: ch.map(function (c) {
          return {
            id: c.id, nom: c.nom, adresse: c.adresse || '', conducteur: conducteurs[c.conducteur_id] || '', conducteur_id: c.conducteur_id || null,
            plans: (c.plans || []).map(function (p) { return { id: p.id, niveau_id: p.niveau_id, titre: p.titre, chemin: p.chemin, indice: p.indice }; }),
            batiments: (c.batiments || []).sort(parOrdre).map(function (b) {
              return {
                id: b.id, nom: b.nom,
                niveaux: (b.niveaux || []).sort(function (x, y) { return x.num - y.num; })
                  .map(function (n) { return { id: n.id, num: n.num, logements: n.nb_logements }; })
              };
            })
          };
        }),
        chefs: noms('chef_chantier'), chefs_equipe: noms('chef_equipe'), compagnons: noms('compagnon')
      };
      await idb.set(K.registre, cfg);
      return { cfg: cfg, enLigne: true };
    } catch (e) {
      var cache = await idb.get(K.registre);
      if (cache) return { cfg: cache, enLigne: false };
      throw e;
    }
  }

  // ------------------------------------------------------------ boîte d'envoi (jamais vidée avant accusé du serveur)
  async function outbox() { return (await idb.get(K.outbox)) || []; }
  async function majOutbox(fn) {
    var o = await outbox();
    var r = fn(o) || o;
    await idb.set(K.outbox, r);
    return r;
  }
  async function mettreEnFile(fiche) {
    var copie = JSON.parse(JSON.stringify(fiche));
    copie.editeLe = copie.editeLe || new Date().toISOString();
    await majOutbox(function (o) {
      var avant = o.filter(function (x) { return x.id === fiche.id; })[0];
      var reste = o.filter(function (x) { return x.id !== fiche.id; });
      reste.push({ id: fiche.id, fiche: copie, ajout: Date.now(), essais: 0, erreur: null, conflit: false,
        recue: false, essaisPhotos: 0, rev: ((avant && avant.rev) || 0) + 1 });
      return reste;
    });
    notifier();
  }
  async function retirer(id) {
    await majOutbox(function (o) { return o.filter(function (x) { return x.id !== id; }); });
    notifier();
  }
  function versServeur(f) {
    return {
      id: f.id, version: f.serverVersion || 0, gabarit_version: 2,
      chantier_id: f.chantier_id, batiment_id: f.batiment_id, niveau_id: f.niveau_id,
      logements: f.logements, date_fiche: f.date, coulage: f.coulage || '',
      chef: f.chef || '', chef_equipe: f.chef_equipe || '', compagnons: f.compagnons || [],
      controleur: f.controleur || '', observations: f.observations || '',
      items: f.items || {}, libres: {}, notes: f.notes || {}, plan_indice: f.plan_indice || '',
      signature: f.signature || '',
      signature_ratio: f.signatureRatio || '', remplace_id: f.remplace_id || '',
      client_updated_at: f.editeLe || new Date().toISOString(), excel_demande: !!f.excel_demande
    };
  }
  // reporte la version serveur sur le brouillon en cours (évite qu'une modification ultérieure soit perdue)
  function reporterVersion(row) {
    try {
      var b = JSON.parse(localStorage.getItem(P + 'brouillon') || 'null');
      if (b && b.id === row.id) { b.serverVersion = row.version; localStorage.setItem(P + 'brouillon', JSON.stringify(b)); }
    } catch (e) { /* ignoré */ }
  }

  function synchroniser() {
    // une synchro déjà lancée : on attend qu'elle finisse, puis on en relance une (nouvelles fiches éventuelles)
    if (syncCourante) return syncCourante.then(function () { return synchroniser(); });
    syncCourante = executerSync().finally(function () { syncCourante = null; });
    return syncCourante;
  }
  async function executerSync() {
    var res = { envoyees: 0, erreurs: 0, restantes: 0, recues: [], photosEchec: 0 };
    var s = sb && navigator.onLine ? await session() : null;
    // pas de session, ou session d'un autre compte que celui qui a rempli les fiches : on n'envoie rien
    if (!s || (dernierCompte() && s.user.id !== dernierCompte())) { res.restantes = (await outbox()).length; return res; }
    var liste = await outbox();
    for (var i = 0; i < liste.length; i++) {
      var e = liste[i];
      var rev = e.rev;
      var row = null;
      if (!e.recue) {
        var r = await sb.rpc('enregistrer_fiche', { f: versServeur(e.fiche) });
        if (r.error && r.error.code === 'P0001' && !e.fiche.serverVersion && /^version:\d+$/.test(r.error.hint || '')) {
          // la fiche existe déjà (envoi précédent) et a été modifiée ici : on rejoue avec la version du serveur
          e.fiche.serverVersion = parseInt(r.error.hint.split(':')[1], 10);
          r = await sb.rpc('enregistrer_fiche', { f: versServeur(e.fiche) });
        }
        if (r.error) {
          if (estSession(r.error)) { res.sessionExpiree = true; break; }   // à reconnecter (même compte : rien n'est perdu)
          if (estReseau(r.error)) break;                                  // transitoire : on réessaiera
          await majOutbox(function (o) {
            o.forEach(function (x) {
              if (x.id === e.id && x.rev === rev) { x.erreur = traduire(r.error).message; x.conflit = r.error.code === 'P0001'; x.essais++; }
            });
          });
          res.erreurs++;
          continue;
        }
        row = r.data;
        reporterVersion(row);
        await majOutbox(function (o) {
          o.forEach(function (x) { if (x.id === e.id && x.rev === rev) { x.recue = true; x.fiche.serverVersion = row.version; x.erreur = null; } });
        });
        res.recues.push(row);
        evenementFiche(row.id, 'envoyee');         // le conducteur, le patron et l'équipe sont prévenus
      }
      // photos (facultatives) : un échec ne bloque jamais les fiches suivantes
      var p = await envoyerPhotos(e.fiche);
      if (p === 'reseau') break;
      if (p === 'ok') {
        await majOutbox(function (o) { return o.filter(function (x) { return !(x.id === e.id && x.rev === rev); }); });
        try { await idb.del(clePhotos(e.id)); } catch (err) { /* ignoré */ }
        res.envoyees++;
      } else {
        await majOutbox(function (o) {
          return o.filter(function (x) {
            if (x.id !== e.id || x.rev !== rev) return true;
            x.essaisPhotos = (x.essaisPhotos || 0) + 1;
            x.erreur = 'Fiche reçue, photos non envoyées : ' + p;
            return x.essaisPhotos < 3;              // après 3 essais : fiche retirée (elle est déjà sur le serveur)
          });
        });
        res.photosEchec++;
      }
    }
    res.restantes = (await outbox()).length;
    notifier(res);
    return res;
  }
  function surChangement(fn) { ecouteurs.push(fn); }
  function notifier(info) { ecouteurs.forEach(function (fn) { try { fn(info); } catch (e) { /* ignoré */ } }); }

  // ------------------------------------------------------------ photos des fiches (IndexedDB -> Storage)
  function clePhotos(ficheId) { return P + 'photos_' + ficheId; }
  async function photos(ficheId) { return (await idb.get(clePhotos(ficheId))) || []; }
  async function enregistrerPhotos(ficheId, liste) { await idb.set(clePhotos(ficheId), liste); }
  async function supprimerPhotos(ficheId) { try { await idb.del(clePhotos(ficheId)); } catch (e) { /* ignoré */ } }
  // 'ok' | 'reseau' | message d'erreur
  async function envoyerPhotos(f) {
    var liste = await photos(f.id);
    for (var i = 0; i < liste.length; i++) {
      var p = liste[i];
      if (p.envoyee) continue;
      var chemin = f.chantier_id + '/' + f.id + '/' + p.id + '.jpg';
      var up = await sb.storage.from('photos').upload(chemin, p.blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error && !/exist|duplicate|409/i.test(up.error.message + ' ' + (up.error.statusCode || ''))) {
        return estReseau(up.error) ? 'reseau' : up.error.message;
      }
      var ins = await sb.from('fiche_photos').insert({ fiche_id: f.id, chantier_id: f.chantier_id, chemin: chemin, legende: p.legende || null });
      if (ins.error && ins.error.code !== '23505') return estReseau(ins.error) ? 'reseau' : ins.error.message;
      p.envoyee = true;
      await enregistrerPhotos(f.id, liste);
    }
    return 'ok';
  }
  async function photosServeur(ficheId) {
    var rows = verifier(await sb.from('fiche_photos').select('chemin,legende').eq('fiche_id', ficheId).order('created_at'));
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var s = await sb.storage.from('photos').createSignedUrl(rows[i].chemin, 3600);
      if (!s.error) out.push({ url: s.data.signedUrl, legende: rows[i].legende });
    }
    return out;
  }

  // ------------------------------------------------------------ lecture / actions bureau
  async function tableauBord() { return verifier(await sb.from('v_tableau_bord').select('*').order('chantier')); }
  async function logements(chantierId) {
    return verifier(await sb.from('v_logements').select('batiment_id,batiment,batiment_ordre,niveau_id,niveau,num,k,code,statut,fiche_id')
      .eq('chantier_id', chantierId).order('batiment_ordre').order('num').order('k'));
  }
  async function fiches(chantierId) {
    var q = sb.from('v_fiches').select('*').order('received_at', { ascending: false }).limit(300);
    if (chantierId) q = q.eq('chantier_id', chantierId);
    return verifier(await q);
  }
  async function fiche(id) { return verifier(await sb.from('fiches').select('*').eq('id', id).single()); }
  async function fichesVisibles() {
    return verifier(await sb.from('fiches')
      .select('id,chantier_id,batiment_id,niveau_id,logements,date_fiche,coulage,etat,resultat,ok,ko,total,chef,chef_equipe,compagnons,created_by,received_at,points_a_corriger')
      .order('received_at', { ascending: false }).limit(200));
  }
  async function monId() { var s = await session(); return s && s.user && s.user.id; }

  // ------------------------------------------------------------ V2, lot C : circulation de la fiche
  // ouverture : vue enregistrée (badge) ; « reçue » si c'est le conducteur du chantier ou le patron
  async function marquerVue(id) { return verifier(await sb.rpc('marquer_vue', { fid: id })); }
  async function mesVues() { return verifier(await sb.from('fiche_vues').select('fiche_id')).map(function (v) { return v.fiche_id; }); }
  async function validerFiche(id, signature) { return verifier(await sb.rpc('valider_fiche', { fid: id, signature: signature })); }
  async function renvoyerACorriger(id, points, note) {
    return verifier(await sb.rpc('renvoyer_a_corriger', { fid: id, points: points, note: note || null }));
  }
  async function memoire(chantierId) {
    return verifier(await sb.from('v_memoire_erreurs').select('point,label,fois').eq('chantier_id', chantierId));
  }
  async function programmations() { return verifier(await sb.from('programmations').select('*').order('date_prevue').limit(200)); }
  async function programmer(p) { return verifier(await sb.from('programmations').insert(p).select().single()); }

  // ------------------------------------------------------------ V2, lot C : fonctions serveur (Excel, notifications)
  async function appelerFonction(nom, corps) {
    var r = await sb.functions.invoke(nom, { body: corps });
    if (!r.error) return r.data;
    var message = r.error.message;
    try { message = (await r.error.context.json()).erreur || message; } catch (e) { /* réponse sans détail */ }
    throw new Error(message);
  }
  // l'Excel de la fiche validée est déposé dans le stockage privé, puis le serveur l'envoie en pièce jointe
  async function envoyerExcel(f, octets, objet, corps, nomFichier) {
    var type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var up = await sb.storage.from('excel').upload(f.chantier_id + '/' + f.id + '.xlsx', new Blob([octets], { type: type }),
      { contentType: type, upsert: true });
    if (up.error) throw traduire(up.error);
    return appelerFonction('envoyer-excel', { fiche_id: f.id, objet: objet, corps: corps, nom_fichier: nomFichier });
  }
  // prévient les bonnes personnes (calculées par le serveur) ; un échec ne bloque jamais l'appli
  function evenementFiche(id, evenement) {
    return appelerFonction('notifier', { fiche_id: id, evenement: evenement }).catch(function () { return null; });
  }
  async function abonnerPush(abonnement) {
    var j = abonnement.toJSON();
    return verifier(await sb.rpc('abonner_push', { point_acces: j.endpoint, cle_p256dh: j.keys.p256dh, cle_auth: j.keys.auth }));
  }
  // ------------------------------------------------------------ V2, lot E : comptes (code à 6 chiffres, Face ID), registre, Alobees
  function activationCompte(corps) { return appelerFonction('activer-compte', corps); }
  async function connexionPasskey() {
    var r = await sb.auth.signInWithPasskey();
    if (r.error) throw traduire(r.error);
    return r.data;
  }
  async function enregistrerPasskey() {
    var r = await sb.auth.registerPasskey();
    if (r.error) throw traduire(r.error);
    verifier(await sb.rpc('noter_passkey'));
  }
  async function personnes() { return verifier(await sb.from('v_personnes').select('*').order('nom')); }
  async function creerPersonne(nom, profil) { return verifier(await sb.rpc('admin_creer_personne', { p_nom: nom, p_profil: profil })); }
  async function nouveauCode(profileId) { return verifier(await sb.rpc('admin_nouveau_code', { pid: profileId })); }
  async function basculerCompte(profileId, actif) { return verifier(await sb.rpc('admin_activer_compte', { pid: profileId, p_actif: actif })); }
  function alobees(action, corps) { return appelerFonction('alobees', Object.assign({ action: action }, corps || {})); }
  async function plansPerimes() { return verifier(await sb.from('v_plans_perimes').select('*')); }

  async function desabonnerCeTelephone() {
    try {
      var reg = root.navigator && root.navigator.serviceWorker && await root.navigator.serviceWorker.getRegistration();
      var abonnement = reg && reg.pushManager && await reg.pushManager.getSubscription();
      if (abonnement && sb) await sb.rpc('desabonner_push', { point_acces: abonnement.endpoint });
    } catch (e) { /* hors réseau : l'abonnement sera remplacé à la prochaine connexion */ }
  }
  async function valider(id) { return verifier(await sb.rpc('valider_fiche', { fid: id })); }
  async function marquerFacturee(ids) { return verifier(await sb.rpc('marquer_facturee', { ids: ids })); }
  async function profils() { return verifier(await sb.from('profiles').select('id,nom,role,actif').order('nom')); }
  async function modifierProfil(p) {
    return verifier(await sb.rpc('admin_modifier_profil', { pid: p.id, p_nom: p.nom, p_role: p.role, p_actif: p.actif }));
  }
  // V2, lot D : une ligne par chantier (réservé au patron et au conducteur)
  async function tdbChantiers() { return verifier(await sb.from('v_tdb_chantiers').select('*').order('chantier')); }
  async function suiviChantiers() { return verifier(await sb.from('v_suivi_chantiers').select('*').order('chantier')); }
  async function fichesParEtat(etat) {
    return verifier(await sb.from('v_fiches').select('*').eq('etat', etat).order('received_at', { ascending: false }).limit(300));
  }

  // ------------------------------------------------------------ comptes (administrateur)
  async function comptes() { return verifier(await sb.from('v_comptes').select('*').order('nom')); }
  async function creerCompte(c) {
    return verifier(await sb.rpc('admin_creer_compte', { p_identifiant: c.identifiant, p_nom: c.nom, p_role: c.role, p_mot_de_passe: c.mdp }));
  }
  async function changerMotDePasse(id, mdp) { return verifier(await sb.rpc('admin_changer_mot_de_passe', { pid: id, p_mot_de_passe: mdp })); }

  // ------------------------------------------------------------ registre des salariés (téléphones : patron / conducteur)
  async function personnel() { return verifier(await sb.rpc('personnel_complet')); }
  async function sauverPersonne(p) {
    var row = { nom: p.nom.trim(), fonction: p.fonction, telephone: p.telephone || null, notes: p.notes || null, actif: p.actif !== false };
    if (p.id) return verifier(await sb.from('personnel').update(row).eq('id', p.id).select('id').single());
    return verifier(await sb.from('personnel').insert(row).select('id').single());
  }

  // ------------------------------------------------------------ chantiers (registre)
  async function chantiersDetail() {
    return verifier(await sb.from('chantiers')
      .select('id,nom,adresse,client,debut,fin,actif,conducteur_id,alobees_id,batiments(id,nom,ordre,niveaux(id,num,nb_logements)),affectations(profile_id)')
      .order('nom'));
  }
  // structure : [{ bid?, batiment, num, nb }] — bid = bâtiment existant (renommage par identifiant, pas par nom)
  async function sauverChantier(c, structure, affectes) {
    structure.forEach(function (s) {
      s.batiment = String(s.batiment || '').trim();
      if (!s.batiment || !(s.num >= -3 && s.num <= 60) || !(s.nb >= 1 && s.nb <= 99)) {
        throw new Error('Ligne de structure invalide : bâtiment obligatoire, niveau entre -3 et 60, 1 à 99 logements.');
      }
    });
    var row = { nom: c.nom.trim(), adresse: c.adresse || null, client: c.client || null, debut: c.debut || null, fin: c.fin || null,
      conducteur_id: c.conducteur_id || null, actif: c.actif !== false };
    var ch = c.id ? verifier(await sb.from('chantiers').update(row).eq('id', c.id).select().single())
                  : verifier(await sb.from('chantiers').insert(row).select().single());
    c.id = ch.id;                                 // un second clic après une erreur ne recrée pas le chantier
    var bats = verifier(await sb.from('batiments').select('id,nom,ordre,niveaux(id,num)').eq('chantier_id', ch.id));
    var parId = {}, parNom = {}, ordreMax = 0;
    bats.forEach(function (b) { parId[b.id] = b; parNom[b.nom] = b; ordreMax = Math.max(ordreMax, b.ordre || 0); });
    // renommages
    for (var r = 0; r < structure.length; r++) {
      var s0 = structure[r];
      if (s0.bid && parId[s0.bid] && parId[s0.bid].nom !== s0.batiment) {
        verifier(await sb.from('batiments').update({ nom: s0.batiment }).eq('id', s0.bid));
        delete parNom[parId[s0.bid].nom];
        parId[s0.bid].nom = s0.batiment;
        parNom[s0.batiment] = parId[s0.bid];
      }
    }
    var gardes = {}, batGardes = {}, avert = [];
    for (var i = 0; i < structure.length; i++) {
      var s = structure[i];
      var b = (s.bid && parId[s.bid]) || parNom[s.batiment];
      if (!b) {
        b = verifier(await sb.from('batiments').insert({ chantier_id: ch.id, nom: s.batiment, ordre: ++ordreMax }).select('id,nom').single());
        b.niveaux = [];
        parNom[s.batiment] = b; parId[b.id] = b;
      }
      batGardes[b.id] = true;
      var n = verifier(await sb.from('niveaux').upsert({ batiment_id: b.id, num: s.num, nb_logements: s.nb },
        { onConflict: 'batiment_id,num' }).select('id').single());
      gardes[n.id] = true;
    }
    for (var id in parId) {
      var bb = parId[id];
      for (var j = 0; j < (bb.niveaux || []).length; j++) {
        var nv = bb.niveaux[j];
        if (gardes[nv.id]) continue;
        var d = await sb.from('niveaux').delete().eq('id', nv.id);
        if (d.error) avert.push(bb.nom + ' niveau ' + nv.num + ' : gardé (des fiches existent)');
      }
      if (!batGardes[id]) {
        var db = await sb.from('batiments').delete().eq('id', id);
        if (db.error) avert.push(bb.nom + ' : gardé (des fiches existent)');
      }
    }
    if (affectes) {
      var actuels = verifier(await sb.from('affectations').select('profile_id').eq('chantier_id', ch.id)).map(function (a) { return a.profile_id; });
      var aAjouter = affectes.filter(function (x) { return actuels.indexOf(x) < 0; });
      var aRetirer = actuels.filter(function (x) { return affectes.indexOf(x) < 0; });
      if (aAjouter.length) verifier(await sb.from('affectations').insert(aAjouter.map(function (x) { return { chantier_id: ch.id, profile_id: x }; })));
      if (aRetirer.length) verifier(await sb.from('affectations').delete().eq('chantier_id', ch.id).in('profile_id', aRetirer));
    }
    return { chantier: ch, avertissements: avert };
  }

  // ------------------------------------------------------------ plans
  async function plans(chantierId) {
    return verifier(await sb.from('plans').select('*').eq('chantier_id', chantierId).order('created_at', { ascending: false }));
  }
  async function ajouterPlan(chantierId, fichier, titre, batimentId, niveauId, indice) {
    var ext = ((fichier.name.split('.').pop() || 'pdf').toLowerCase().match(/^(pdf|png|jpe?g|webp)$/) || ['pdf'])[0];
    var chemin = chantierId + '/' + (root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now()) + '.' + ext;
    var up = await sb.storage.from('plans').upload(chemin, fichier, { contentType: fichier.type || 'application/pdf' });
    if (up.error) throw traduire(up.error);
    return verifier(await sb.from('plans').insert({ chantier_id: chantierId, batiment_id: batimentId || null, niveau_id: niveauId || null,
      titre: titre || fichier.name, chemin: chemin, type_mime: fichier.type || 'application/pdf', taille: fichier.size,
      indice: indice || null }).select().single());
  }
  async function supprimerPlan(p) {
    verifier(await sb.from('plans').delete().eq('id', p.id));
    await sb.storage.from('plans').remove([p.chemin]);
  }
  async function urlPlan(p) {
    var s = await sb.storage.from('plans').createSignedUrl(p.chemin, 3600);
    if (s.error) throw traduire(s.error);
    return s.data.signedUrl;
  }

  root.Cloud = {
    actif: actif, client: sb, traduire: traduire, versCourriel: versCourriel,
    session: session, etatSession: etatSession, connexion: connexion, deconnexion: deconnexion, profil: profil, registre: registre,
    outbox: outbox, mettreEnFile: mettreEnFile, retirer: retirer, synchroniser: synchroniser, surChangement: surChangement,
    verifierProprietaire: verifierProprietaire, tableauBord: tableauBord, logements: logements, fiches: fiches, fiche: fiche, valider: valider,
    fichesVisibles: fichesVisibles, monId: monId,
    marquerVue: marquerVue, mesVues: mesVues, validerFiche: validerFiche, renvoyerACorriger: renvoyerACorriger,
    memoire: memoire, programmations: programmations, programmer: programmer,
    envoyerExcel: envoyerExcel, evenementFiche: evenementFiche, abonnerPush: abonnerPush,
    activationCompte: activationCompte, connexionPasskey: connexionPasskey, enregistrerPasskey: enregistrerPasskey,
    personnes: personnes, creerPersonne: creerPersonne, nouveauCode: nouveauCode, basculerCompte: basculerCompte,
    alobees: alobees, plansPerimes: plansPerimes,
    marquerFacturee: marquerFacturee, profils: profils, modifierProfil: modifierProfil,
    suiviChantiers: suiviChantiers, fichesParEtat: fichesParEtat, tdbChantiers: tdbChantiers,
    comptes: comptes, creerCompte: creerCompte, changerMotDePasse: changerMotDePasse,
    personnel: personnel, sauverPersonne: sauverPersonne,
    chantiersDetail: chantiersDetail, sauverChantier: sauverChantier,
    plans: plans, ajouterPlan: ajouterPlan, supprimerPlan: supprimerPlan, urlPlan: urlPlan,
    photos: photos, enregistrerPhotos: enregistrerPhotos, supprimerPhotos: supprimerPhotos, photosServeur: photosServeur
  };
})(typeof self !== 'undefined' ? self : this);
