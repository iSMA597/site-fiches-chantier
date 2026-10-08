/*
 * Appli V2 : écran de connexion (identifiant + mot de passe, connexion gardée sur l'appareil).
 * Le code d'activation à 6 chiffres et Face ID arrivent au lot E (ADR-0015).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var h = ES.outils.h;

  function vue() {
    var erreur = ES.etat.erreurConnexion;
    return {
      haut: '',
      contenu: '<form class="login" data-formulaire="connexion" autocomplete="on">' +
        '<img src="icons/logo.png" alt="Euro Sanichauff">' +
        '<h1 class="login__titre">Fiches chantier</h1>' +
        '<label>Identifiant<input class="inp" id="identifiant" name="username" autocomplete="username" autocapitalize="none" required></label>' +
        '<label>Mot de passe<input class="inp" id="mot-de-passe" type="password" name="password" autocomplete="current-password" required></label>' +
        (erreur ? '<p class="alert" role="alert">' + h(erreur) + '</p>' : '') +
        '<button class="btn btn--primary btn--big" type="submit">Se connecter</button>' +
        '<p class="muted centre">La connexion reste ouverte sur cet appareil. Mot de passe oublié ? Demandez au bureau.</p>' +
        '</form>',
      bas: ''
    };
  }

  async function seConnecter() {
    var identifiant = document.getElementById('identifiant').value;
    var mdp = document.getElementById('mot-de-passe').value;
    ES.etat.erreurConnexion = null;
    try {
      await root.Cloud.connexion(identifiant, mdp);
      await ES.app.chargerSession();
    } catch (e) {
      ES.etat.erreurConnexion = e.message || 'Connexion impossible.';
    }
  }

  ES.connexion = { vue: vue, seConnecter: seConnecter };
})(window);
