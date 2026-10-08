/*
 * Appli V2, lot E : importer la structure d'un chantier depuis un fichier (maquette validée, décision 25 : pas d'IA).
 *  - Excel / CSV : colonnes « Bâtiment », « Niveau », et « Logement » (une ligne par logement) ou « Nombre » ;
 *  - PDF texte : repérage de « Bâtiment X », du niveau (RDC, R+1…) et des lots / logements, sur l'appareil.
 *    Un PDF scanné (une image) ne se lit pas : saisie à la main avec + et −.
 * L'appli propose ; les lignes douteuses sont à confirmer ; rien n'est enregistré avant « Enregistrer ».
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  // ------------------------------------------------------------ lecture d'un niveau et d'un bâtiment
  function lireNiveau(texte) {
    var t = String(texte || '').toUpperCase().replace(/\s+/g, '');
    if (!t) return null;
    if (/^(RDC|REZ-?DE-?CHAUSS[EÉ]E|0)$/.test(t)) return 0;
    var m = t.match(/^(?:R\+?|NIVEAU|N|ETAGE|ÉTAGE)?(\d{1,2})(?:ER|E|EME|ÈME)?$/);
    if (m) return Number(m[1]);
    m = t.match(/^(?:R-|SS|SOUS-?SOL)(\d)$/);
    return m ? -Number(m[1]) : null;
  }
  function lireBatiment(texte) {
    var t = String(texte || '').trim();
    if (!t) return null;
    var m = t.toUpperCase().match(/^(?:B[AÂ]T(?:IMENT)?\.?\s*)?([A-Z0-9]{1,3})$/);
    return m ? 'Bât ' + m[1] : t;
  }
  function ajouter(prop, batiment, niveau, nb, doute) {
    var cle = batiment + '|' + niveau;
    var ligne = prop.filter(function (x) { return x.cle === cle; })[0];
    if (!ligne) { ligne = { cle: cle, batiment: batiment, num: niveau, nb: 0, doute: null }; prop.push(ligne); }
    ligne.nb += nb;
    if (doute && !ligne.doute) ligne.doute = doute;
  }
  function trier(prop) {
    return prop.sort(function (a, b) { return a.batiment === b.batiment ? a.num - b.num : (a.batiment < b.batiment ? -1 : 1); });
  }

  // ------------------------------------------------------------ Excel / CSV
  function tableauCsv(texte) {
    var sep = (texte.split('\n')[0].match(/;/g) || []).length >= (texte.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    return texte.split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (l) { return l.split(sep).map(function (c) { return c.replace(/^"|"$/g, '').trim(); }); });
  }
  async function tableauExcel(fichier) {
    var classeur = new root.ExcelJS.Workbook();
    await classeur.xlsx.load(await fichier.arrayBuffer());
    var feuille = classeur.worksheets[0], lignes = [];
    feuille.eachRow({ includeEmpty: false }, function (row) {
      lignes.push(row.values.slice(1).map(function (v) { return v && typeof v === 'object' ? (v.text || v.result || '') : String(v === undefined || v === null ? '' : v); }));
    });
    return lignes;
  }
  function depuisTableau(lignes) {
    var entete = -1, col = {};
    for (var i = 0; i < Math.min(lignes.length, 15) && entete < 0; i++) {
      lignes[i].forEach(function (c, j) {
        var t = String(c).toLowerCase();
        if (/b[aâ]t/.test(t)) col.bat = j;
        else if (/niv|[ée]tage/.test(t)) col.niv = j;
        else if (/^(nb|nombre)|nombre de|qt[ée]/.test(t)) col.nb = j;
        else if (/log|lot|appart/.test(t)) col.log = j;
      });
      if (col.niv !== undefined && (col.log !== undefined || col.nb !== undefined)) entete = i; else col = {};
    }
    if (entete < 0) throw new Error('Colonnes « Niveau » et « Logement » (ou « Nombre ») introuvables dans le fichier.');
    var prop = [];
    lignes.slice(entete + 1).forEach(function (l) {
      var bat = col.bat !== undefined ? lireBatiment(l[col.bat]) : 'Bât A';
      var niv = lireNiveau(l[col.niv]);
      if (!bat && niv === null) return;                          // ligne vide
      if (niv === null) { ajouter(prop, bat || 'Bât A', 0, 1, 'niveau illisible : « ' + (l[col.niv] || 'cellule vide') + ' »'); return; }
      if (col.nb !== undefined) {
        var nb = parseInt(l[col.nb], 10);
        ajouter(prop, bat || 'Bât A', niv, nb > 0 ? nb : 1, nb > 0 ? null : 'nombre illisible : « ' + (l[col.nb] || 'cellule vide') + ' »');
      } else {
        ajouter(prop, bat || 'Bât A', niv, 1, String(l[col.log] || '').trim() ? null : 'cellule vide');
      }
    });
    return trier(prop);
  }

  // ------------------------------------------------------------ PDF (texte seulement)
  async function textePdf(fichier) {
    // chargé seulement ici (gros fichier) ; adresses calculées depuis la page (ce script n'est pas un module)
    var pdfjs = await import(new URL('js/vendor/pdfjs/pdf.min.mjs', document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('js/vendor/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
    var doc = await pdfjs.getDocument({ data: await fichier.arrayBuffer(), isEvalSupported: false }).promise;
    var lignes = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var contenu = await (await doc.getPage(p)).getTextContent(), parLigne = {};
      contenu.items.forEach(function (it) { var y = Math.round(it.transform[5]); (parLigne[y] = parLigne[y] || []).push(it.str); });
      Object.keys(parLigne).sort(function (a, b) { return b - a; }).forEach(function (y) { lignes.push(parLigne[y].join(' ')); });
    }
    return lignes;
  }
  function depuisTextePdf(lignes) {
    var prop = [], batiment = 'Bât A', niveau = null, vus = {};
    lignes.forEach(function (ligne) {
      var t = ligne.toUpperCase();
      var b = t.match(/B[AÂ]T(?:IMENT)?\.?\s*([A-Z0-9]{1,2})\b/);
      if (b) batiment = 'Bât ' + b[1];
      var n = t.match(/\bRDC\b|REZ[- ]DE[- ]CHAUSS|\bR\s*\+\s*(\d{1,2})\b|\b(\d{1,2})(?:ER|E|EME|ÈME)\s+[ÉE]TAGE\b/);
      if (n) niveau = n[1] ? Number(n[1]) : n[2] ? Number(n[2]) : 0;
      var lots = t.match(/\b(?:LOT|LOGEMENT|LGT|APPT|APPARTEMENT)\s*N?°?\s*([A-Z]?\d{1,4}[A-Z]?)\b/g) || [];
      lots.forEach(function (lot) {
        var cle = batiment + '|' + lot;
        if (vus[cle]) return;
        vus[cle] = true;
        if (niveau === null) ajouter(prop, batiment, 0, 1, '« ' + lot.trim() + ' » sans niveau repéré');
        else ajouter(prop, batiment, niveau, 1, /DUPLEX|\?/.test(t) ? '« ' + ligne.trim().slice(0, 40) + ' »' : null);
      });
    });
    if (!prop.length) throw new Error('Aucun lot ou logement trouvé. PDF scanné ? Saisissez la structure à la main avec + et −.');
    return trier(prop);
  }

  // ------------------------------------------------------------ écran de proposition
  function vue() {
    var s = ES.etat.importStructure, c = ES.registre.chantierOuvert();
    var doutes = s.proposition.filter(function (r) { return r.doute; }).length;
    var out = '<div class="info">Proposition à vérifier : corrigez si besoin, puis enregistrez. Rien n\'est enregistré avant. <b>La structure actuelle du chantier sera remplacée.</b></div>' +
      '<p class="muted">Fichier : ' + h(s.nom) + '</p>' +
      '<table class="tbl"><thead><tr><th>Bâtiment</th><th>Niveau</th><th>Logements</th><th></th></tr></thead><tbody>' +
      s.proposition.map(function (r, i) {
        return '<tr class="' + (r.doute ? 'doubt' : '') + '"><td>' + h(r.batiment) + '</td><td>' + o.nivL(r.num) + '</td>' +
          '<td><span class="stepper"><button data-a="import-nb" data-v="' + i + '|-1" aria-label="moins">−</button><b>' + r.nb + '</b>' +
          '<button data-a="import-nb" data-v="' + i + '|1" aria-label="plus">+</button></span></td>' +
          '<td>' + (r.doute ? '<button class="btn btn--sm btn--ghost" data-a="import-ok" data-v="' + i + '" title="' + h(r.doute) + '">⚠ Confirmer</button>' : '✓') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (doutes ? '<p class="foot__hint">' + o.pluriel(doutes, 'ligne') + ' à vérifier : ' + s.proposition.filter(function (r) { return r.doute; }).map(function (r) { return h(r.doute); }).join(' · ') + '</p>' : '') +
      '<div class="foot__row foot__row--marge"><button class="btn btn--ghost" data-a="import-annuler">Annuler</button>' +
      '<button class="btn btn--ok" data-a="import-enregistrer"' + (doutes ? ' disabled' : '') + '>Enregistrer</button></div>';
    return { haut: '<div class="top"><button class="top__back" data-a="import-annuler" aria-label="Retour">‹</button><div class="top__t"><strong>Importer</strong><span>' + h(c.nom) + '</span></div></div>',
      contenu: out, bas: '' };
  }

  async function fichierChoisi(el) {
    var fichier = el.files && el.files[0];
    if (!fichier) return;
    try {
      var nom = fichier.name.toLowerCase(), proposition;
      if (nom.endsWith('.pdf')) proposition = depuisTextePdf(await textePdf(fichier));
      else if (nom.endsWith('.csv')) proposition = depuisTableau(tableauCsv(await fichier.text()));
      else proposition = depuisTableau(await tableauExcel(fichier));
      ES.etat.importStructure = { nom: fichier.name, proposition: proposition, chantier: ES.etat.ecran.id };
      ES.etat.ecran = { n: 'import-structure', id: ES.etat.ecran.id };
    } catch (e) { o.toast('Lecture impossible : ' + e.message); }
  }

  var ACTIONS = {
    'import-nb': function (v) {
      var m = v.split('|'), r = ES.etat.importStructure.proposition[+m[0]];
      r.nb = Math.max(1, Math.min(99, r.nb + Number(m[1])));
      r.doute = null;                                   // corrigé à la main
    },
    'import-ok': function (v) { ES.etat.importStructure.proposition[+v].doute = null; },
    'import-annuler': function () { ES.etat.ecran = { n: 'reg-chantier', id: ES.etat.importStructure.chantier }; },
    'import-enregistrer': async function () {
      var s = ES.etat.importStructure, c = ES.registre.chantierOuvert();
      var existants = {};
      ES.registre.batimentsTries(c).forEach(function (b) { existants[b.nom] = b.id; });
      var structure = s.proposition.map(function (r) { return { bid: existants[r.batiment], batiment: r.batiment, num: r.num, nb: r.nb }; });
      ES.etat.ecran = { n: 'reg-chantier', id: s.chantier };
      await ES.registre.enregistrer(c, structure);
      o.toast('Structure enregistrée');
    }
  };

  ES.importStructure = { vue: vue, fichierChoisi: fichierChoisi, ACTIONS: ACTIONS,
    lireNiveau: lireNiveau, depuisTableau: depuisTableau, depuisTextePdf: depuisTextePdf };
})(window);
