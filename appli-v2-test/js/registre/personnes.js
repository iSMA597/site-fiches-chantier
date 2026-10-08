/*
 * Appli V2, lot E : Registre › Personnes (ADR-0015), comme la maquette validée.
 *  - Pas d'inscription libre : le patron ajoute la personne, l'appli donne un code à 6 chiffres (48 h, une seule fois)
 *    à remettre en main propre ou par message (QR code) ; l'employé choisit lui-même son mot de passe.
 *  - Profil, nouveau code (mot de passe oublié), désactivation immédiate au départ d'un salarié.
 *  - Import des membres actifs d'Alobees (lecture seule) dans la liste des personnes.
 * Le conducteur voit la liste en lecture seule.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  var PROFILS = [['compagnon', 'Compagnon'], ['chef_equipe', 'Chef d\'équipe'], ['chef_chantier', 'Chef de chantier'],
    ['conducteur', 'Conducteur de travaux'], ['facturation', 'Facturation']];
  var FONCTIONS = { chef_chantier: 'Chef de chantier', chef_equipe: 'Chef d\'équipe', compagnon: 'Compagnon' };
  var ETATS = {
    code: '<b class="txt-attente">⏳ En attente d\'activation</b>', code_expire: '<b class="txt-ko">⌛ Code expiré : donnez un nouveau code</b>',
    actif: '✓ Compte activé', passkey: '🔐 Face ID / empreinte', desactive: '<b class="txt-ko">⛔ Compte désactivé</b>'
  };
  function patron() { return ES.etat.profil.role === 'admin'; }
  function libelleProfil(p) { return p.fonction === 'chef_equipe' ? 'Chef d\'équipe' : (o.ROLES[p.role] || p.role); }

  async function charger() {
    try {
      if (patron()) {
        var r = await Promise.all([root.Cloud.personnes(), root.Cloud.personnel()]);
        ES.etat.reg.personnes = r[0];
        ES.etat.reg.sansCompte = r[1].filter(function (x) { return !x.profile_id && x.actif; });
        ES.etat.reg.retires = r[1].filter(function (x) { return !x.profile_id && !x.actif; });
      } else {
        ES.etat.reg.personnes = null;
        ES.etat.reg.sansCompte = (await root.Cloud.personnel()).filter(function (x) { return x.actif; });
      }
    } catch (e) { o.toast(e.message); }
  }

  // ------------------------------------------------------------ liste
  function vue() {
    var out = '';
    if (!patron()) {
      out += '<div class="info">Lecture seule : seul le patron gère les personnes et les comptes.</div>';
      return out + '<div class="list">' + (ES.etat.reg.sansCompte || []).map(function (p) {
        return '<div class="person"><span class="avatar" aria-hidden="true">' + o.initiales(p.nom) + '</span><div><strong>' + h(p.nom) + '</strong><br>' +
          '<span class="muted">' + h(FONCTIONS[p.fonction] || p.fonction) + '</span></div></div>';
      }).join('') + '</div>';
    }
    out += '<div class="info">Pas d\'inscription libre : le bureau crée chaque personne et lui remet un <b>code à 6 chiffres</b> (48 h, une seule fois). L\'employé choisit lui-même son mot de passe.</div>';
    var comptes = ES.etat.reg.personnes || [];
    var ligneCompte = function (p) {
      return '<button class="person person--btn" data-a="personne" data-v="' + p.id + '"><span class="avatar" aria-hidden="true">' + o.initiales(p.nom) + '</span>' +
        '<div><strong>' + h(p.nom) + '</strong><br>' + h(libelleProfil(p)) + '<br><span class="muted">Identifiant : ' + h(p.identifiant) + ' · ' + (ETATS[p.etat_compte] || '') + '</span></div>' +
        '<span class="chev" aria-hidden="true">›</span></button>';
    };
    out += '<div class="list">' + comptes.filter(function (p) { return p.actif; }).map(ligneCompte).join('') + '</div>';
    var desactives = comptes.filter(function (p) { return !p.actif; });
    if (desactives.length) {
      out += '<details class="replie"><summary>Comptes désactivés (' + desactives.length + ')</summary><div class="list">' + desactives.map(ligneCompte).join('') + '</div></details>';
    }
    var sans = ES.etat.reg.sansCompte || [];
    if (sans.length) {
      out += '<h3>Sur les fiches, sans compte (' + sans.length + ')</h3><div class="list">' + sans.map(function (p) {
        return '<div class="person"><span class="avatar" aria-hidden="true">' + o.initiales(p.nom) + '</span><div><strong>' + h(p.nom) + '</strong><br>' +
          '<span class="muted">' + h(FONCTIONS[p.fonction] || p.fonction) + '</span></div>' +
          '<span class="person__btns"><button class="btn btn--sm btn--ghost" data-a="personne-compte" data-v="' + h(p.nom) + '|' + p.fonction + '">Créer son compte</button>' +
          '<button class="btn btn--sm btn--ghost" data-a="personnel-retirer" data-v="' + p.id + '" aria-label="Retirer ' + h(p.nom) + ' de la liste">Retirer</button></span></div>';
      }).join('') + '</div>';
    }
    var retires = ES.etat.reg.retires || [];
    if (retires.length) {
      out += '<details class="replie"><summary>Retirés de la liste (' + retires.length + ')</summary><div class="list">' + retires.map(function (p) {
        return '<div class="person"><span class="avatar" aria-hidden="true">' + o.initiales(p.nom) + '</span><div><strong>' + h(p.nom) + '</strong><br>' +
          '<span class="muted">' + h(FONCTIONS[p.fonction] || p.fonction) + ' · reste sur les anciennes fiches</span></div>' +
          '<button class="btn btn--sm btn--ghost" data-a="personnel-retablir" data-v="' + p.id + '">Rétablir</button></div>';
      }).join('') + '</div></details>';
    }
    out += '<button class="btn btn--ghost btn--block foot__row--marge" data-a="alobees-membres">⇩ Importer des personnes depuis Alobees</button>' +
      '<button class="btn btn--primary btn--block foot__row--marge" data-a="personne-ajout">＋ Ajouter une personne</button>';
    return out;
  }

  // ------------------------------------------------------------ feuilles
  function qrCode(texte) {
    if (!root.qrcode) return '';
    var qr = root.qrcode(0, 'M');
    qr.addData(texte);
    qr.make();
    return '<div class="qr">' + qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true, alt: 'QR code d\'activation' }) + '</div>';
  }
  function lienActivation(code) {
    return location.origin + location.pathname + '?code=' + code;     // le QR code ouvre l'appli sur l'écran du code, déjà rempli
  }
  function feuilleCode() {
    var f = ES.etat.feuille;
    return '<div class="sheet__h"><strong>Code d\'activation : ' + h(f.nom) + '</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      (f.nouveau ? '<div class="lock">✓ Personne créée · identifiant : <b>' + h(f.identifiant) + '</b></div>'
        : '<p class="muted">L\'ancien mot de passe ne marchera plus une fois ce code utilisé.</p>') +
      '<div class="code6 code6--grand" aria-label="Code ' + f.code.split('').join(' ') + '">' + f.code.slice(0, 3) + ' ' + f.code.slice(3) + '</div>' +
      qrCode(lienActivation(f.code)) +
      '<p class="centre txt-navy"><b>Valable 48 h · une seule fois</b></p>' +
      '<ol class="etapes-code"><li>Ouvrir l\'appli Fiches chantier (ou scanner le QR code)</li><li>« Première connexion : j\'ai un code à 6 chiffres »</li>' +
      '<li>Taper le code</li><li>Choisir son mot de passe, puis Face ID / empreinte</li></ol>' +
      (root.navigator.share ? '<button class="btn btn--ok btn--block" data-a="code-partager">📤 Envoyer (WhatsApp, SMS, mail…)</button>' : '') +
      '<div class="foot__row"><a class="btn btn--ghost" href="' + h(lienWhatsApp(f)) + '"' + (telephone() ? '' : ' target="_blank" rel="noopener"') + '>💬 WhatsApp direct</a>' +
      '<button class="btn btn--ghost" data-a="code-copier">📋 Copier le message</button></div>' +
      '<p class="muted">À donner en main propre ou par message. Pas besoin d\'adresse mail. Ce code ne sera plus affiché ensuite.</p>';
  }
  // message prêt à envoyer : lien qui ouvre l'appli avec le code déjà rempli, et le code en clair (iPhone : à retaper)
  function messageInvitation(f) {
    var prenom = String(f.nom || '').split(' ')[0];
    return 'Bonjour ' + prenom + ', voici l\'appli Fiches chantier d\'Euro Sanichauff : ' + lienActivation(f.code) + '\n' +
      'Votre code d\'activation : ' + f.code + ' (valable 48 h, une seule fois).\n' +
      '1. Ouvrez le lien  2. Touchez « Installer l\'appli sur ce téléphone »  3. Ouvrez l\'appli installée et validez le code.';
  }
  // sur téléphone : l'application WhatsApp elle-même (la page wa.me échoue souvent depuis l'appli installée sur iPhone) ;
  // sur PC : WhatsApp Web
  function telephone() { return /iPhone|iPad|iPod|Android/.test(root.navigator.userAgent); }
  function lienWhatsApp(f) {
    var texte = encodeURIComponent(messageInvitation(f));
    return telephone() ? 'whatsapp://send?text=' + texte : 'https://wa.me/?text=' + texte;
  }
  function feuilleAjout() {
    var f = ES.etat.feuille;
    return '<div class="sheet__h"><strong>Ajouter une personne</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<form class="form-col" data-formulaire="personne-ajout">' +
      '<label class="field__l">Nom<input class="inp" name="nom" value="' + h(f.nom || '') + '" placeholder="Prénom Nom" autocomplete="off" required maxlength="80"></label>' +
      '<div class="field"><div class="field__l">Profil</div><div class="chips">' + PROFILS.map(function (p) {
        return '<button type="button" class="chip" data-a="personne-profil" data-v="' + p[0] + '" aria-pressed="' + (f.profil === p[0]) + '">' + p[1] + '</button>';
      }).join('') + '</div></div>' +
      '<button class="btn btn--primary btn--big" type="submit">Créer et générer le code</button></form>';
  }
  function feuillePersonne() {
    var p = (ES.etat.reg.personnes || []).filter(function (x) { return x.id === ES.etat.feuille.id; })[0];
    if (!p) return '';
    var moi = p.id === ES.etat.monId;
    var roles = [['compagnon', 'Compagnon'], ['chef_chantier', 'Chef de chantier'], ['conducteur', 'Conducteur'], ['facturation', 'Facturation'], ['admin', 'Patron']];
    return '<div class="sheet__h"><strong>' + h(p.nom) + '</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<p class="muted">Identifiant : <b>' + h(p.identifiant) + '</b> · ' + (ETATS[p.etat_compte] || '') + '</p>' +
      (moi ? '' : '<div class="field"><div class="field__l">Profil</div><div class="chips">' + roles.map(function (r) {
        return '<button class="chip" data-a="personne-role" data-v="' + r[0] + '" aria-pressed="' + (p.role === r[0]) + '"' + (p.actif ? '' : ' disabled') + '>' + r[1] + '</button>';
      }).join('') + '</div></div>') +
      (p.actif ? '<button class="btn btn--ghost btn--block" data-a="personne-code">🔑 Nouveau code (mot de passe oublié)</button>' : '') +
      (moi ? '' : (p.actif ? '<button class="btn btn--ko btn--block foot__row--marge" data-a="personne-desactiver">⛔ Désactiver le compte (départ)</button>'
        : '<button class="btn btn--ok btn--block foot__row--marge" data-a="personne-reactiver">↺ Réactiver le compte</button>'));
  }

  function montrerCode(r, nouveau) {
    ES.etat.feuille = { type: 'code', nom: r.nom || ES.etat.feuille.nom, identifiant: r.identifiant, code: r.code, nouveau: nouveau };
  }
  var FORMULAIRES = {
    'personne-ajout': async function (form) {
      var nom = String(new FormData(form).get('nom') || '').trim(), profil = ES.etat.feuille.profil;
      if (nom.length < 2) { o.toast('Indiquez le nom'); return; }
      try {
        var r = await root.Cloud.creerPersonne(nom, profil);
        montrerCode(r, true);
        await charger();
      } catch (e) { o.toast(e.message); }
    }
  };
  Object.assign(ES.registre.FORMULAIRES, FORMULAIRES);

  var ACTIONS = {
    'code-partager': async function () {
      try { await root.navigator.share({ text: messageInvitation(ES.etat.feuille) }); } catch (e) { /* partage annulé */ }
    },
    'code-copier': async function () {
      try { await root.navigator.clipboard.writeText(messageInvitation(ES.etat.feuille)); o.toast('Message copié : collez-le dans WhatsApp ou un SMS'); }
      catch (e) { o.toast('Copie impossible sur ce téléphone : utilisez « Envoyer »'); }
    },
    'personne-ajout': function () { ES.etat.feuille = { type: 'personne-ajout', profil: 'compagnon' }; },
    // personne sans compte ajoutée en trop : retirée des choix d'équipe, son nom reste sur les anciennes fiches
    'personnel-retirer': async function (v) {
      var p = (ES.etat.reg.sansCompte || []).filter(function (x) { return x.id === v; })[0];
      if (!p || !root.confirm('Retirer ' + p.nom + ' de la liste ? Son nom reste sur les anciennes fiches ; « Rétablir » le fait revenir.')) return;
      await root.Cloud.retirerPersonnel(v, false);
      o.toast(p.nom + ' retiré(e) de la liste');
      await charger();
      await ES.app.rafraichirRegistreFiches();
    },
    'personnel-retablir': async function (v) {
      await root.Cloud.retirerPersonnel(v, true);
      o.toast('Remis dans la liste');
      await charger();
      await ES.app.rafraichirRegistreFiches();
    },
    'personne-profil': function (v) {
      var champ = document.querySelector('[data-formulaire="personne-ajout"] [name="nom"]');
      ES.etat.feuille.nom = champ ? champ.value : ES.etat.feuille.nom;     // le nom tapé n'est pas perdu
      ES.etat.feuille.profil = v;
    },
    'personne-compte': async function (v) {
      var m = v.split('|');
      try { montrerCode(await root.Cloud.creerPersonne(m[0], m[1]), true); await charger(); } catch (e) { o.toast(e.message); }
    },
    'personne': function (v) { ES.etat.feuille = { type: 'personne', id: v }; },
    'personne-code': async function () {
      var p = (ES.etat.reg.personnes || []).filter(function (x) { return x.id === ES.etat.feuille.id; })[0];
      try { var r = await root.Cloud.nouveauCode(p.id); r.nom = p.nom; montrerCode(r, false); await charger(); } catch (e) { o.toast(e.message); }
    },
    'personne-role': async function (v) {
      var p = (ES.etat.reg.personnes || []).filter(function (x) { return x.id === ES.etat.feuille.id; })[0];
      try { await root.Cloud.modifierProfil({ id: p.id, nom: p.nom, role: v, actif: p.actif }); await charger(); o.toast('Profil modifié'); } catch (e) { o.toast(e.message); }
    },
    'personne-desactiver': async function () {
      var p = (ES.etat.reg.personnes || []).filter(function (x) { return x.id === ES.etat.feuille.id; })[0];
      if (!root.confirm('Désactiver le compte de ' + p.nom + ' ? Il ne pourra plus se connecter, tout de suite.')) return;
      try { await root.Cloud.basculerCompte(p.id, false); await charger(); o.toast('Compte désactivé'); } catch (e) { o.toast(e.message); }
    },
    'personne-reactiver': async function () {
      try { await root.Cloud.basculerCompte(ES.etat.feuille.id, true); await charger(); o.toast('Compte réactivé'); } catch (e) { o.toast(e.message); }
    }
  };

  ES.personnes = { vue: vue, charger: charger, feuilleCode: feuilleCode, feuilleAjout: feuilleAjout, feuillePersonne: feuillePersonne, ACTIONS: ACTIONS };
})(window);
