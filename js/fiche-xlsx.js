/*
 * Euro Sanichauff - remplissage de la fiche Excel (ADR-0009)
 * Charge le modèle fiche_modele.xlsx (même mise en page que le Projet 1), écrit les valeurs
 * aux adresses décrites dans contenu.json, ajoute la signature et un onglet masqué « Données »
 * lu par la macro « Importer des fiches mobiles » du classeur (Projet 2).
 * Fonctionne dans le navigateur (window.FicheXlsx) et sous Node (module.exports).
 */
(function (root) {
  'use strict';

  var BOX = { '': '☐', OK: '☑', KO: '☒' };
  var COLORS = { '': 'FF27214E', OK: 'FF1E7B45', KO: 'FFB42318' };

  function isoToDate(iso) {
    if (!iso) return null;
    var p = String(iso).split('-');
    if (p.length < 3) return null;
    // midi UTC : évite tout décalage de jour lié au fuseau horaire
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
  }

  function niveauLabel(num) {
    if (num === '' || num === null || num === undefined) return '';
    num = +num;
    return num === 0 ? 'RDC' : (num > 0 ? 'R+' + num : 'R' + num);
  }

  function codeLogement(num, k) {
    var n = Math.abs(+num), s = (n < 10 ? '0' : '') + n;
    return (+num < 0 ? '-' : '') + s + k;
  }

  function stats(contenu, fiche) {
    var total = 0, ok = 0, ko = 0, anomalies = [];
    contenu.sections.forEach(function (s) {
      s.items.forEach(function (it) {
        if (it.libre && !(fiche.libres && fiche.libres[it.id])) return;
        total++;
        var v = (fiche.items || {})[it.id] || '';
        if (v === 'OK') ok++;
        if (v === 'KO') { ko++; anomalies.push(it.libre ? fiche.libres[it.id] : it.label); }
      });
    });
    var statut = ko > 0 ? 'ANOMALIE' : (ok === total ? 'COMPLÈTE' : (ok === 0 ? 'À DÉMARRER' : 'EN COURS'));
    return { total: total, ok: ok, ko: ko, statut: statut, anomalies: anomalies };
  }

  function nettoyer(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9+\-]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function logementsTexte(logs) {
    logs = (logs || []).filter(Boolean);
    if (!logs.length) return '';
    if (logs.length <= 2) return logs.join('-');
    return logs[0] + '-' + logs[logs.length - 1];
  }

  function nomFichier(fiche) {
    return ['Incorporation', nettoyer(fiche.chantier), nettoyer(fiche.batiment), nettoyer(fiche.niveau),
      'Log' + nettoyer(logementsTexte(fiche.logements)), (fiche.date || '')].filter(Boolean).join('_') + '.xlsx';
  }

  function objetMail(fiche) {
    return fiche.chantier + ' – Incorporation – Fiche de vérification – ' + fiche.batiment + ' ' + fiche.niveau +
      ' – Log. ' + logementsTexte(fiche.logements);
  }

  function frDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function corpsMail(contenu, fiche) {
    var st = stats(contenu, fiche);
    var l = [
      'Fiche de vérification « Incorporations avant coulage béton »',
      '',
      'Chantier : ' + fiche.chantier,
      'Bâtiment / niveau : ' + fiche.batiment + ' – ' + fiche.niveau,
      'Logement(s) : ' + (fiche.logements || []).filter(Boolean).join(', '),
      'Date : ' + frDate(fiche.date) + '   ·   Coulage prévu : ' + frDate(fiche.coulage),
      'Chef de chantier : ' + (fiche.chef || '—') + '   ·   Chef d\'équipe : ' + (fiche.chef_equipe || '—'),
      'Compagnons : ' + ((fiche.compagnons || []).join(', ') || '—'),
      '',
      'Contrôles validés : ' + st.ok + ' / ' + st.total + '   ·   Anomalies : ' + st.ko + '   ·   Statut : ' + st.statut
    ];
    if (st.anomalies.length) {
      l.push('Anomalies :');
      st.anomalies.forEach(function (a) { l.push('  - ' + a); });
    }
    if (fiche.observations) l.push('Observations : ' + fiche.observations);
    l.push('', 'Fiche Excel jointe. Envoyé depuis l\'application Euro Sanichauff.');
    return l.join('\n');
  }

  function setVal(ws, addr, value) {
    var c = ws.getCell(addr);
    c.value = (value === undefined || value === null) ? null : value;
    return c;
  }

  async function generer(ExcelJS, modeleBuffer, contenu, fiche) {
    var wb = new ExcelJS.Workbook();
    await wb.xlsx.load(modeleBuffer);
    var ws = wb.getWorksheet('Fiche');
    var C = contenu.cellules, F = C.fields;

    setVal(ws, F.chantier, fiche.chantier);
    setVal(ws, F.batiment, fiche.batiment);
    setVal(ws, F.niveau, fiche.niveau);
    [['date', fiche.date], ['coulage', fiche.coulage]].forEach(function (d) {
      var c = setVal(ws, F[d[0]], isoToDate(d[1]));
      c.numFmt = 'dd/mm/yyyy';
    });
    setVal(ws, F.chef, fiche.chef);
    setVal(ws, F.chef_equipe, fiche.chef_equipe);
    setVal(ws, F.compagnons, (fiche.compagnons || []).join(' / '));
    F.logements.forEach(function (addr, i) { setVal(ws, addr, (fiche.logements || [])[i] || null); });
    setVal(ws, F.observations, fiche.observations || null);
    setVal(ws, F.controleur, fiche.controleur || null);

    Object.keys(C.items).forEach(function (id) {
      var v = (fiche.items || {})[id] || '';
      var cell = ws.getCell(C.items[id].box);
      cell.value = BOX[v];
      cell.font = Object.assign({}, cell.font, { color: { argb: COLORS[v] }, bold: v !== '' });
      var libre = fiche.libres && fiche.libres[id];
      if (libre) setVal(ws, C.items[id].text, libre);
    });

    if (fiche.signature && /^data:image\/png;base64,/.test(fiche.signature)) {
      var img = wb.addImage({ base64: fiche.signature, extension: 'png' });
      var m = C.signature.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      var colIdx = function (s) { return s.split('').reduce(function (a, ch) { return a * 26 + ch.charCodeAt(0) - 64; }, 0); };
      // ancre sur deux cellules : ExcelJS écrit mal les ancres « oneCell » (fichier refusé par Excel)
      // largeur proportionnelle au tracé : hauteur de case ~45 px, colonne ~51 px
      var c0 = colIdx(m[1]) - 1 + 0.1, ratio = +fiche.signatureRatio || 3;
      var c1 = Math.min(colIdx(m[3]) - 0.05, c0 + (38 * ratio) / 51);
      ws.addImage(img, {
        tl: { col: c0, row: +m[2] - 1 + 0.08 },
        br: { col: c1, row: +m[4] - 0.08 },
        editAs: 'oneCell'
      });
    }

    // onglet masqué « Données » : lu par la macro du classeur (Projet 2)
    var d = wb.addWorksheet('Données', { state: 'hidden' });
    var rows = [
      ['format', 'eurosanichauff-fiche'], ['version', '1'], ['source', 'application-mobile'],
      ['chantier', fiche.chantier], ['batiment', fiche.batiment], ['niveau', fiche.niveau],
      ['date', fiche.date || ''], ['coulage', fiche.coulage || ''], ['chef', fiche.chef || ''],
      ['chef_equipe', fiche.chef_equipe || ''],
      ['compagnon1', (fiche.compagnons || [])[0] || ''], ['compagnon2', (fiche.compagnons || []).slice(1).join(' / ')],
      ['controleur', fiche.controleur || ''], ['observations', fiche.observations || '']
    ];
    for (var k = 0; k < F.logements.length; k++) rows.push(['log' + (k + 1), (fiche.logements || [])[k] || '']);
    Object.keys(C.items).forEach(function (id) {
      rows.push([id, (fiche.items || {})[id] || '']);
      if (fiche.libres && fiche.libres[id]) rows.push([id + '_texte', fiche.libres[id]]);
    });
    var st = stats(contenu, fiche);
    rows.push(['total', String(st.total)], ['ok', String(st.ok)], ['ko', String(st.ko)], ['statut', st.statut]);
    rows.forEach(function (r) {
      var row = d.addRow(r);
      row.getCell(2).numFmt = '@';
    });
    d.getColumn(1).width = 16;
    d.getColumn(2).width = 50;

    // ExcelJS écrit <pageSetUpPr> avant <outlinePr> : ordre refusé par Excel -> on retire outlinePr (inutile ici)
    wb.worksheets.forEach(function (w) { if (w.properties) delete w.properties.outlineProperties; });
    return wb.xlsx.writeBuffer();
  }

  var api = {
    generer: generer, stats: stats, nomFichier: nomFichier, objetMail: objetMail, corpsMail: corpsMail,
    niveauLabel: niveauLabel, codeLogement: codeLogement, logementsTexte: logementsTexte, frDate: frDate
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FicheXlsx = api;
})(typeof self !== 'undefined' ? self : this);
