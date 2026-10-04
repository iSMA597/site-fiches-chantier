/*
 * Euro Sanichauff – connexion à la plateforme (Projet 4, ADR-0011 / ADR-0012)
 * Session persistante, registre en cache (hors ligne), boîte d'envoi IndexedDB, appels serveur.
 * Inactif si js/config.js ne définit pas l'adresse du serveur : l'appli reste alors en mode « local » (Projet 3).
 */
(function (root) {
  'use strict';

  var CFG = root.ES_CONFIG || {};
  var actif = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && root.supabase && root.idbKeyval);
  var idb = root.idbKeyval;
  var K = { outbox: 'es_outbox', registre: 'es_registre', profil: 'es_profil' };
  var sb = actif ? root.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'es_auth', detectSessionInUrl: false }
  }) : null;
  var ecouteurs = [];
  var syncEnCours = false;

  // ------------------------------------------------------------ erreurs lisibles
  function traduire(err) {
    if (!err) return new Error('Erreur inconnue');
    var m = err.message || String(err);
    if (/Invalid login credentials/i.test(m)) m = 'Email ou mot de passe incorrect.';
    else if (/Email not confirmed/i.test(m)) m = 'Compte non activé : contactez le bureau.';
    else if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = 'Pas de connexion au serveur.';
    else if (/JWT|refresh token/i.test(m)) m = 'Session expirée : reconnectez-vous.';
    var e = new Error(m);
    e.code = err.code;
    e.reseau = estReseau(err);
    return e;
  }
  function estReseau(err) {
    var m = (err && (err.message || String(err))) || '';
    return /Failed to fetch|NetworkError|Load failed|network|fetch/i.test(m) || (err && err.status === 0);
  }
  function verifier(r) { if (r.error) throw traduire(r.error); return r.data; }

  // ------------------------------------------------------------ session / profil
  async function session() {
    if (!sb) return null;
    var r = await sb.auth.getSession();
    return r.data && r.data.session;
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
    return r.data.session;
  }
  async function deconnexion() {
    try { await sb.auth.signOut(); } catch (e) { /* hors ligne : session locale effacée quand même */ }
    await idb.del(K.profil);
    await idb.del(K.registre);
  }
  async function profil() {
    try {
      var s = await session();
      var p = verifier(await sb.from('profiles').select('id,nom,role,actif').eq('id', s.user.id).single());
      if (!p.actif) throw new Error('Compte désactivé : contactez le bureau.');
      await idb.set(K.profil, p);
      return p;
    } catch (e) {
      var cache = await idb.get(K.profil);
      if (cache && (e.reseau || estReseau(e))) return cache;
      throw e.message ? e : traduire(e);
    }
  }

  // ------------------------------------------------------------ registre (chantiers, structure, personnel)
  function parOrdre(a, b) { return (a.ordre - b.ordre) || String(a.nom).localeCompare(b.nom); }
  async function registre() {
    try {
      var ch = verifier(await sb.from('chantiers')
        .select('id,nom,adresse,actif,batiments(id,nom,ordre,niveaux(id,num,nb_logements))')
        .eq('actif', true).order('nom'));
      var pe = verifier(await sb.from('personnel').select('nom,fonction').eq('actif', true).order('nom'));
      var noms = function (f) { return pe.filter(function (x) { return x.fonction === f; }).map(function (x) { return x.nom; }); };
      var cfg = {
        format: 'eurosanichauff-config', version: 1, source: 'serveur', maj: new Date().toISOString(),
        chantiers: ch.map(function (c) {
          return {
            id: c.id, nom: c.nom, adresse: c.adresse || '',
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
  async function mettreEnFile(fiche) {
    var o = (await outbox()).filter(function (x) { return x.id !== fiche.id; });
    o.push({ id: fiche.id, fiche: JSON.parse(JSON.stringify(fiche)), ajout: Date.now(), essais: 0, erreur: null, conflit: false });
    await idb.set(K.outbox, o);
    notifier();
  }
  async function retirer(id) {
    await idb.set(K.outbox, (await outbox()).filter(function (x) { return x.id !== id; }));
    notifier();
  }
  function versServeur(f) {
    return {
      id: f.id, version: f.serverVersion || 0, gabarit_version: 1,
      chantier_id: f.chantier_id, batiment_id: f.batiment_id, niveau_id: f.niveau_id,
      logements: f.logements, date_fiche: f.date, coulage: f.coulage || '',
      chef: f.chef || '', chef_equipe: f.chef_equipe || '', compagnons: f.compagnons || [],
      controleur: f.controleur || '', observations: f.observations || '',
      items: f.items || {}, libres: f.libres || {}, signature: f.signature || '',
      signature_ratio: f.signatureRatio || '', remplace_id: f.remplace_id || '',
      client_updated_at: new Date().toISOString()
    };
  }
  async function synchroniser() {
    var res = { envoyees: 0, erreurs: 0, restantes: 0, recues: [] };
    if (!sb || syncEnCours) { res.restantes = (await outbox()).length; return res; }
    if (!navigator.onLine || !(await session())) { res.restantes = (await outbox()).length; return res; }
    syncEnCours = true;
    try {
      var liste = await outbox();
      for (var i = 0; i < liste.length; i++) {
        var e = liste[i];
        var r = await sb.rpc('enregistrer_fiche', { f: versServeur(e.fiche) });
        var courante = await outbox();
        var ligne = courante.filter(function (x) { return x.id === e.id; })[0];
        if (!ligne) continue;
        if (r.error) {
          if (estReseau(r.error)) break;                          // on réessaiera au retour du réseau
          ligne.erreur = traduire(r.error).message;
          ligne.conflit = r.error.code === 'P0001';
          ligne.essais++;
          res.erreurs++;
          await idb.set(K.outbox, courante);
        } else {
          // photos (facultatives) : envoyées après la fiche ; la fiche reste en file tant qu'elles ne sont pas parties
          var photosOK = await envoyerPhotos(e.fiche);
          if (!photosOK) { break; }
          courante = await outbox();
          await idb.set(K.outbox, courante.filter(function (x) { return x.id !== e.id; }));
          res.envoyees++;
          res.recues.push(r.data);
        }
      }
    } finally {
      syncEnCours = false;
      res.restantes = (await outbox()).length;
      notifier(res);
    }
    return res;
  }
  // ------------------------------------------------------------ photos des fiches (IndexedDB -> Storage)
  function clePhotos(ficheId) { return 'es_photos_' + ficheId; }
  async function photos(ficheId) { return (await idb.get(clePhotos(ficheId))) || []; }
  async function enregistrerPhotos(ficheId, liste) { await idb.set(clePhotos(ficheId), liste); }
  async function envoyerPhotos(f) {
    var liste = await photos(f.id);
    for (var i = 0; i < liste.length; i++) {
      var p = liste[i];
      if (p.envoyee) continue;
      var chemin = f.chantier_id + '/' + f.id + '/' + p.id + '.jpg';
      var up = await sb.storage.from('photos').upload(chemin, p.blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error && !/exists|Duplicate/i.test(up.error.message)) return false;
      var ins = await sb.from('fiche_photos').insert({ fiche_id: f.id, chantier_id: f.chantier_id, chemin: chemin, legende: p.legende || null });
      if (ins.error && ins.error.code !== '23505') return false;
      p.envoyee = true;
      await enregistrerPhotos(f.id, liste);
    }
    return true;
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

  function surChangement(fn) { ecouteurs.push(fn); }
  function notifier(info) { ecouteurs.forEach(function (fn) { try { fn(info); } catch (e) { /* ignoré */ } }); }

  // ------------------------------------------------------------ lecture / actions bureau
  async function tableauBord() { return verifier(await sb.from('v_tableau_bord').select('*').order('chantier')); }
  async function logements(chantierId) {
    return verifier(await sb.from('v_logements').select('batiment,batiment_ordre,niveau,num,k,code,statut')
      .eq('chantier_id', chantierId).order('batiment_ordre').order('num').order('k'));
  }
  async function fiches(chantierId) {
    var q = sb.from('v_fiches').select('*').order('received_at', { ascending: false }).limit(300);
    if (chantierId) q = q.eq('chantier_id', chantierId);
    return verifier(await q);
  }
  async function fiche(id) { return verifier(await sb.from('fiches').select('*').eq('id', id).single()); }
  async function valider(id) { return verifier(await sb.rpc('valider_fiche', { fid: id })); }
  async function marquerFacturee(ids) { return verifier(await sb.rpc('marquer_facturee', { ids: ids })); }
  async function profils() { return verifier(await sb.from('profiles').select('id,nom,role,actif').order('nom')); }
  async function modifierProfil(p) {
    return verifier(await sb.rpc('admin_modifier_profil', { pid: p.id, p_nom: p.nom, p_role: p.role, p_actif: p.actif }));
  }
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

  // ------------------------------------------------------------ registre des salariés
  async function personnel() { return verifier(await sb.from('personnel').select('*').order('nom')); }
  async function sauverPersonne(p) {
    var row = { nom: p.nom, fonction: p.fonction, telephone: p.telephone || null, notes: p.notes || null, actif: p.actif !== false };
    if (p.id) return verifier(await sb.from('personnel').update(row).eq('id', p.id).select().single());
    return verifier(await sb.from('personnel').insert(row).select().single());
  }

  // ------------------------------------------------------------ chantiers (registre)
  async function chantiersDetail() {
    return verifier(await sb.from('chantiers')
      .select('id,nom,adresse,client,debut,fin,actif,conducteur_id,batiments(id,nom,ordre,niveaux(id,num,nb_logements)),affectations(profile_id)')
      .order('nom'));
  }
  async function sauverChantier(c, structure, affectes) {
    var row = { nom: c.nom, adresse: c.adresse || null, client: c.client || null, debut: c.debut || null, fin: c.fin || null,
      conducteur_id: c.conducteur_id || null, actif: c.actif !== false };
    var ch = c.id ? verifier(await sb.from('chantiers').update(row).eq('id', c.id).select().single())
                  : verifier(await sb.from('chantiers').insert(row).select().single());
    // structure : bâtiments (créés au besoin), niveaux (créés ou mis à jour), niveaux retirés supprimés si aucune fiche
    var bats = verifier(await sb.from('batiments').select('id,nom,niveaux(id,num)').eq('chantier_id', ch.id));
    var parNom = {}; bats.forEach(function (b) { parNom[b.nom] = b; });
    var ordre = 0, gardes = {}, avert = [];
    for (var i = 0; i < structure.length; i++) {
      var s = structure[i];
      if (!parNom[s.batiment]) {
        parNom[s.batiment] = verifier(await sb.from('batiments').insert({ chantier_id: ch.id, nom: s.batiment, ordre: ++ordre }).select('id,nom').single());
        parNom[s.batiment].niveaux = [];
      }
      var b = parNom[s.batiment];
      var n = verifier(await sb.from('niveaux').upsert({ batiment_id: b.id, num: s.num, nb_logements: s.nb },
        { onConflict: 'batiment_id,num' }).select('id').single());
      gardes[n.id] = true;
    }
    for (var nomB in parNom) {
      var bb = parNom[nomB];
      for (var j = 0; j < (bb.niveaux || []).length; j++) {
        var nv = bb.niveaux[j];
        if (gardes[nv.id]) continue;
        var d = await sb.from('niveaux').delete().eq('id', nv.id);
        if (d.error) avert.push(nomB + ' niveau ' + nv.num + ' : gardé (des fiches existent)');
      }
      if (!structure.some(function (s) { return s.batiment === nomB; })) {
        var db = await sb.from('batiments').delete().eq('id', bb.id);
        if (db.error) avert.push(nomB + ' : gardé (des fiches existent)');
      }
    }
    if (affectes) {
      var actuels = verifier(await sb.from('affectations').select('profile_id').eq('chantier_id', ch.id)).map(function (a) { return a.profile_id; });
      var aAjouter = affectes.filter(function (id) { return actuels.indexOf(id) < 0; });
      var aRetirer = actuels.filter(function (id) { return affectes.indexOf(id) < 0; });
      if (aAjouter.length) verifier(await sb.from('affectations').insert(aAjouter.map(function (id) { return { chantier_id: ch.id, profile_id: id }; })));
      if (aRetirer.length) verifier(await sb.from('affectations').delete().eq('chantier_id', ch.id).in('profile_id', aRetirer));
    }
    return { chantier: ch, avertissements: avert };
  }

  // ------------------------------------------------------------ plans
  async function plans(chantierId) {
    return verifier(await sb.from('plans').select('*').eq('chantier_id', chantierId).order('created_at', { ascending: false }));
  }
  async function ajouterPlan(chantierId, fichier, titre, batimentId, niveauId) {
    var ext = (fichier.name.split('.').pop() || 'pdf').toLowerCase();
    var chemin = chantierId + '/' + (root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now()) + '.' + ext;
    var up = await sb.storage.from('plans').upload(chemin, fichier, { contentType: fichier.type || 'application/pdf' });
    if (up.error) throw traduire(up.error);
    return verifier(await sb.from('plans').insert({ chantier_id: chantierId, batiment_id: batimentId || null, niveau_id: niveauId || null,
      titre: titre || fichier.name, chemin: chemin, type_mime: fichier.type || 'application/pdf', taille: fichier.size }).select().single());
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
    session: session, connexion: connexion, deconnexion: deconnexion, profil: profil, registre: registre,
    outbox: outbox, mettreEnFile: mettreEnFile, retirer: retirer, synchroniser: synchroniser, surChangement: surChangement,
    tableauBord: tableauBord, logements: logements, fiches: fiches, fiche: fiche, valider: valider,
    marquerFacturee: marquerFacturee, profils: profils, modifierProfil: modifierProfil,
    suiviChantiers: suiviChantiers, fichesParEtat: fichesParEtat,
    comptes: comptes, creerCompte: creerCompte, changerMotDePasse: changerMotDePasse,
    personnel: personnel, sauverPersonne: sauverPersonne,
    chantiersDetail: chantiersDetail, sauverChantier: sauverChantier,
    plans: plans, ajouterPlan: ajouterPlan, supprimerPlan: supprimerPlan, urlPlan: urlPlan,
    photos: photos, enregistrerPhotos: enregistrerPhotos, photosServeur: photosServeur
  };
})(typeof self !== 'undefined' ? self : this);
