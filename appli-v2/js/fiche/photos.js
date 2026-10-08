/*
 * Appli V2 : photos de la fiche (étape 7, facultatives).
 * Réduites sur le téléphone à environ 300 Ko, gardées sur l'appareil (IndexedDB) jusqu'à l'envoi.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var MAX_PHOTOS = 10;
  var COTE_MAX_PX = 1600;          // côté le plus long après réduction
  var POIDS_CIBLE = 320 * 1024;    // environ 300 Ko par photo
  var apercus = {};                // id photo -> adresse d'aperçu (mémoire de la page)

  async function reduire(fichier) {
    var image = await createImageBitmap(fichier);
    var echelle = Math.min(1, COTE_MAX_PX / Math.max(image.width, image.height));
    var toile = document.createElement('canvas');
    toile.width = Math.round(image.width * echelle);
    toile.height = Math.round(image.height * echelle);
    toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
    var qualite = 0.8, blob;
    do {
      blob = await new Promise(function (ok) { toile.toBlob(ok, 'image/jpeg', qualite); });
      qualite -= 0.1;
    } while (blob.size > POIDS_CIBLE && qualite > 0.3);
    // une photo JPEG déjà légère reste telle quelle (la « réduire » l'alourdirait)
    if (fichier.type === 'image/jpeg' && fichier.size <= POIDS_CIBLE && fichier.size <= blob.size) return fichier;
    return blob;
  }

  async function liste(ficheId) { return root.Cloud ? root.Cloud.photos(ficheId) : []; }

  // ajoute des photos choisies (appareil photo ou galerie) ; renvoie le nombre de photos illisibles
  async function ajouter(ficheId, fichiers) {
    var actuelles = await liste(ficheId);
    var illisibles = 0;
    var aTraiter = Array.prototype.slice.call(fichiers, 0, MAX_PHOTOS - actuelles.length);
    for (var i = 0; i < aTraiter.length; i++) {
      try {
        var blob = await reduire(aTraiter[i]);
        actuelles.push({ id: ES.outils.uuid(), blob: blob, legende: null, poidsAvant: aTraiter[i].size });
      } catch (e) { illisibles++; }
    }
    await root.Cloud.enregistrerPhotos(ficheId, actuelles);
    return illisibles;
  }
  async function retirer(ficheId, photoId) {
    var reste = (await liste(ficheId)).filter(function (p) { return p.id !== photoId; });
    await root.Cloud.enregistrerPhotos(ficheId, reste);
    if (apercus[photoId]) { URL.revokeObjectURL(apercus[photoId]); delete apercus[photoId]; }
  }
  function apercu(photo) {
    if (!apercus[photo.id]) apercus[photo.id] = URL.createObjectURL(photo.blob);
    return apercus[photo.id];
  }
  function poidsLisible(octets) {
    return octets > 1048576 ? (octets / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.round(octets / 1024) + ' Ko';
  }

  ES.photos = { MAX: MAX_PHOTOS, liste: liste, ajouter: ajouter, retirer: retirer, apercu: apercu, poidsLisible: poidsLisible };
})(window);
