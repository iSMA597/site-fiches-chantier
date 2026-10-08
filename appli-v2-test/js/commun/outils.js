/*
 * Appli V2 : petits outils partagés par tous les écrans (texte sûr, dates, niveaux, messages).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};

  // texte affiché dans la page : toujours échappé (aucun nom ou note ne peut injecter du code)
  function h(texte) {
    return String(texte === undefined || texte === null ? '' : texte).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var nivL = function (num) { return num === 0 ? 'RDC' : (num < 0 ? 'SS' + (-num) : 'R+' + num); };
  // code logement : niveau sur 2 chiffres + numéro (RDC 001, R+2 021) — ADR-0004
  var codeLogement = function (num, k) { return String(num).padStart(2, '0') + k; };
  var pluriel = function (n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); };

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var isoJour = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var aujourdhui = function () { return isoJour(new Date()); };
  var dansJours = function (k) { var d = new Date(); d.setDate(d.getDate() + k); return d; };
  var jourCourt = function (d) { return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
  var frDate = function (iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; };

  var initiales = function (nom) {
    return String(nom || '?').split(/[\s.]+/).filter(Boolean).map(function (m) { return m[0]; }).join('').slice(0, 2).toUpperCase();
  };
  var uuid = function () { return root.crypto.randomUUID(); };

  // message court en bas d'écran
  var minuteur = null;
  function toast(texte) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = texte;
    el.hidden = false;
    clearTimeout(minuteur);
    minuteur = setTimeout(function () { el.hidden = true; }, 3000);
  }

  var ROLES = {
    admin: 'Patron (admin)', conducteur: 'Conducteur de travaux', chef_chantier: 'Chef de chantier',
    compagnon: 'Compagnon', facturation: 'Facturation'
  };
  // V2 : seuls le patron, le conducteur et le chef de chantier créent des fiches (le compagnon les reçoit)
  var peutCreer = function (role) { return role === 'admin' || role === 'conducteur' || role === 'chef_chantier'; };

  ES.outils = {
    h: h, nivL: nivL, codeLogement: codeLogement, pluriel: pluriel, aujourdhui: aujourdhui, dansJours: dansJours,
    isoJour: isoJour, jourCourt: jourCourt, frDate: frDate, initiales: initiales, uuid: uuid, toast: toast,
    ROLES: ROLES, peutCreer: peutCreer
  };
})(window);
