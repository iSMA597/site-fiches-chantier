/*
 * Appli V2 : connexion (lot E, ADR-0015), comme la maquette validée.
 *  - identifiant + mot de passe, ou Face ID / empreinte (passkey) ; la connexion reste ouverte sur l'appareil ;
 *  - première connexion : code à 6 chiffres remis par le bureau → l'employé choisit son mot de passe
 *    → proposition d'activer Face ID / empreinte (le mot de passe reste en secours).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;
  var LONGUEUR_MINI = 10;

  function passkeyPossible() { return !!root.PublicKeyCredential; }
  function erreur() { var e = ES.etat.erreurConnexion; return e ? '<p class="alert" role="alert">' + h(e) + '</p>' : ''; }
  function cadre(corps) {
    return { haut: '', bas: '', contenu: '<div class="login"><img src="icons/logo.png" alt="Euro Sanichauff"><h1 class="login__titre">Fiches chantier</h1>' +
      ES.installation.bandeau() + corps + '</div>' };
  }

  function vue() {
    var etape = ES.etat.etapeConnexion || 'connexion', a = ES.etat.activation || {};
    if (etape === 'code') {
      return cadre('<form class="login__form" data-formulaire="code">' +
        '<p class="lead centre">Tapez le code à 6 chiffres remis par le bureau. Il est valable 48 h et ne sert qu\'une fois.</p>' +
        '<input class="inp code6" id="code6" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" placeholder="••••••" aria-label="Code d\'activation à 6 chiffres" value="' + h(ES.etat.codePrerempli || '') + '" required>' +
        erreur() + '<button class="btn btn--primary btn--big" type="submit">Valider le code</button></form>' +
        '<button class="link centre-bloc" data-a="connexion-retour">‹ Retour</button>');
    }
    if (etape === 'mdp') {
      return cadre('<form class="login__form" data-formulaire="mot-de-passe">' +
        '<div class="lock">✓ Code accepté · ' + h(a.nom) + ' · identifiant : <b>' + h(a.identifiant) + '</b></div>' +
        '<input type="text" name="username" autocomplete="username" value="' + h(a.identifiant) + '" hidden>' +
        '<label>Choisissez votre mot de passe<input class="inp" id="mdp1" type="password" autocomplete="new-password" minlength="' + LONGUEUR_MINI + '" placeholder="' + LONGUEUR_MINI + ' caractères minimum" required></label>' +
        '<label>Confirmez-le<input class="inp" id="mdp2" type="password" autocomplete="new-password" required></label>' +
        '<p class="muted">Personne d\'autre ne le connaît, pas même le bureau.</p>' +
        erreur() + '<button class="btn btn--primary btn--big" type="submit">Enregistrer</button></form>');
    }
    if (etape === 'passkey') {
      return cadre('<div class="centre gros-picto" aria-hidden="true">🔐</div>' +
        '<h2 class="centre">Activer Face ID / empreinte ?</h2>' +
        '<p class="lead centre">La prochaine fois, l\'appli s\'ouvre avec votre visage ou votre doigt. Le mot de passe reste en secours.</p>' +
        erreur() + '<button class="btn btn--primary btn--big" data-a="passkey-oui">Oui, activer</button>' +
        '<button class="btn btn--ghost btn--block" data-a="passkey-plus-tard">Plus tard</button>');
    }
    return cadre('<form class="login__form" data-formulaire="connexion" autocomplete="on">' +
      '<label>Identifiant<input class="inp" id="identifiant" name="username" autocomplete="username webauthn" autocapitalize="none" required></label>' +
      '<label>Mot de passe<input class="inp" id="mot-de-passe" type="password" name="password" autocomplete="current-password" required></label>' +
      erreur() + '<button class="btn btn--primary btn--big" type="submit">Se connecter</button></form>' +
      (passkeyPossible() ? '<button class="btn btn--ghost btn--big" data-a="connexion-passkey">🔐 Face ID / empreinte</button>' : '') +
      '<button class="link centre-bloc" data-a="connexion-code">Première connexion : j\'ai un code à 6 chiffres</button>' +
      '<p class="muted centre">La connexion reste ouverte sur cet appareil. Mot de passe oublié ? Le bureau vous donne un nouveau code.</p>');
  }

  // ------------------------------------------------------------ formulaires
  async function seConnecter() {
    await root.Cloud.connexion(document.getElementById('identifiant').value, document.getElementById('mot-de-passe').value);
    await ES.app.chargerSession();
  }
  async function verifierCode() {
    var code = document.getElementById('code6').value.trim();
    if (!/^\d{6}$/.test(code)) throw new Error('Le code doit avoir 6 chiffres.');
    var r = await root.Cloud.activationCompte({ action: 'verifier', code: code });
    ES.etat.activation = { code: code, identifiant: r.identifiant, nom: r.nom };
    ES.etat.etapeConnexion = 'mdp';
  }
  async function choisirMotDePasse() {
    var m1 = document.getElementById('mdp1').value, m2 = document.getElementById('mdp2').value, a = ES.etat.activation;
    if (m1.length < LONGUEUR_MINI) throw new Error('Mot de passe trop court (' + LONGUEUR_MINI + ' caractères minimum).');
    if (m1 !== m2) throw new Error('Les deux mots de passe sont différents.');
    await root.Cloud.activationCompte({ action: 'activer', code: a.code, mot_de_passe: m1 });
    await root.Cloud.connexion(a.identifiant, m1);
    ES.etat.activation = null;
    ES.etat.codePrerempli = null;
    ES.installation.oublierCode();                         // code utilisé : plus rien à garder sur le téléphone
    if (passkeyPossible()) ES.etat.etapeConnexion = 'passkey';
    else { ES.etat.etapeConnexion = null; await ES.app.chargerSession(); }
  }
  var FORMULAIRES = { 'connexion': seConnecter, 'code': verifierCode, 'mot-de-passe': choisirMotDePasse };
  async function soumettre(nom) {
    ES.etat.erreurConnexion = null;
    try { await FORMULAIRES[nom](); } catch (e) { ES.etat.erreurConnexion = e.message || 'Connexion impossible.'; }
  }

  var ACTIONS = {
    'connexion-code': function () { ES.etat.erreurConnexion = null; ES.etat.etapeConnexion = 'code'; },
    'connexion-retour': function () { ES.etat.erreurConnexion = null; ES.etat.etapeConnexion = null; },
    'connexion-passkey': async function () {
      ES.etat.erreurConnexion = null;
      try { await root.Cloud.connexionPasskey(); await ES.app.chargerSession(); }
      catch (e) {
        ES.etat.erreurConnexion = e.reseau ? 'Pas de connexion au serveur : réessayez quand le réseau revient.'
          : 'Face ID / empreinte pas encore activé sur ce téléphone : connectez-vous une fois avec le mot de passe.';
      }
    },
    'passkey-oui': async function () {
      try { await root.Cloud.enregistrerPasskey(); o.toast('🔐 Face ID / empreinte activé'); }
      catch (e) { o.toast('Face ID / empreinte non activé : ' + e.message); }
      ES.etat.etapeConnexion = null;
      await ES.app.chargerSession();
    },
    'passkey-plus-tard': async function () { ES.etat.etapeConnexion = null; await ES.app.chargerSession(); }
  };

  ES.connexion = { vue: vue, soumettre: soumettre, ACTIONS: ACTIONS };
})(window);
