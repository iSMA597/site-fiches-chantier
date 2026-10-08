/*
 * Appli V2 : le brouillon de fiche en cours, gardé sur l'appareil (fonctionne sans réseau).
 * Les règles de passage d'une étape à l'autre sont ici (étapes 4 à 6 bloquantes : décision 1 du 05/10).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var CLE = ((root.ES_CONFIG && root.ES_CONFIG.prefixe) || 'es2_') + 'brouillon';
  var ETAPES = ['Chantier', 'Emplacement', 'Équipe', 'Documents', 'Matériel', 'Contrôles', 'Photos', 'Envoi'];
  var LOGEMENTS_MAX = 6;   // une fiche couvre 6 logements au plus (gabarit papier)

  function nouveau(profil) {
    return {
      id: ES.outils.uuid(), serverVersion: 0,
      chantier_id: null, batiment_id: null, niveau_id: null, logements: [],
      date: ES.outils.aujourdhui(), coulage: null,
      chef: profil.role === 'chef_chantier' ? profil.nom : null, chef_equipe: null, compagnons: [],
      items: {}, notes: {}, observations: '', signature: null, signatureRatio: null, lu: false,
      plan_indice: null, aCorriger: [], etape: 1, vues: 1, auteur: profil.nom
    };
  }
  function charger() {
    try { return JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { return null; }
  }
  function sauver(b) {
    try { localStorage.setItem(CLE, JSON.stringify(b)); } catch (e) { ES.outils.toast('Mémoire du téléphone pleine : brouillon non enregistré'); }
  }
  function effacer() { try { localStorage.removeItem(CLE); } catch (e) { /* ignoré */ } }

  function etapeFaite(b, n) {
    switch (n) {
      case 1: return !!b.chantier_id;
      case 2: return !!b.batiment_id && !!b.niveau_id && b.logements.length > 0;
      case 3: return !!b.coulage && !!b.chef && b.compagnons.length > 0;
      case 4: case 5: case 6:
        return ES.gabarit.sectionsV2()[n - 4].points.every(function (p) { return !!b.items[p.id]; });
      case 7: return b.vues > 7;          // photos facultatives : faite dès qu'on l'a vue
      default: return false;
    }
  }
  // on peut aller à l'étape k si toutes les étapes avant elle sont faites
  function accessible(b, k) {
    for (var i = 1; i < k; i++) if (!etapeFaite(b, i)) return false;
    return true;
  }
  function ceQuiManque(b, n) {
    var m = [];
    if (n === 1) return 'Choisissez un chantier';
    if (n === 2) {
      if (!b.batiment_id) m.push('le bâtiment');
      if (!b.niveau_id) m.push('le niveau');
      if (!b.logements.length) m.push('au moins 1 logement');
      return 'Choisissez ' + m.join(', ');
    }
    if (n === 3) {
      if (!b.coulage) m.push('la date de coulage');
      if (!b.chef) m.push('le chef de chantier');
      if (!b.compagnons.length) m.push('au moins 1 compagnon');
      return 'Indiquez ' + m.join(', ');
    }
    if (n >= 4 && n <= 6) {
      var reste = ES.gabarit.sectionsV2()[n - 4].points.filter(function (p) { return !b.items[p.id]; }).length;
      return 'Encore ' + ES.outils.pluriel(reste, 'point') + ' sans réponse (Fait ou Anomalie)';
    }
    return '';
  }

  // une fiche est déjà en cours : on demande avant de la remplacer (ses photos sont alors effacées)
  async function remplacerAvecAccord() {
    var b = ES.etat.brouillon;
    if (!b) return true;
    if (!root.confirm('Une fiche est déjà en cours sur ce téléphone. La remplacer ? Elle sera perdue.')) return false;
    await root.Cloud.supprimerPhotos(b.id);
    effacer();
    ES.etat.brouillon = null;
    return true;
  }

  ES.brouillon = { remplacerAvecAccord: remplacerAvecAccord, ETAPES: ETAPES, LOGEMENTS_MAX: LOGEMENTS_MAX, nouveau: nouveau, charger: charger, sauver: sauver,
    effacer: effacer, etapeFaite: etapeFaite, accessible: accessible, ceQuiManque: ceQuiManque };
})(window);
