/*
 * Appli V2 : l'assistant « Nouvelle fiche » en 8 étapes (maquettes validées le 08/10/2026).
 * Chaque étape = une fonction d'affichage. Les actions (boutons data-a="…") sont dans ACTIONS, en bas.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var o = ES.outils, h = o.h;

  // ------------------------------------------------------------ accès aux données du registre
  function chantier(id) { return (ES.etat.registre.chantiers || []).filter(function (c) { return c.id === id; })[0]; }
  function batiment(c, id) { return c && c.batiments.filter(function (b) { return b.id === id; })[0]; }
  function niveau(b, id) { return b && b.niveaux.filter(function (n) { return n.id === id; })[0]; }
  function lieu(b) {
    var c = chantier(b.chantier_id), bt = batiment(c, b.batiment_id), nv = niveau(bt, b.niveau_id);
    return [bt && bt.nom, nv && o.nivL(nv.num), b.logements.join(' ')].filter(Boolean).join(' · ');
  }
  function brouillon() { return ES.etat.brouillon; }
  function enregistrer() { ES.brouillon.sauver(ES.etat.brouillon); }

  // ------------------------------------------------------------ cadre : haut, carrés d'étapes, bas
  function vue() {
    var b = brouillon(), n = b.etape;
    var carres = ES.brouillon.ETAPES.map(function (titre, i) {
      var k = i + 1, fait = ES.brouillon.etapeFaite(b, k), rouge = aReprendre(b, k);
      var ouvert = ES.brouillon.accessible(b, k) && (k <= b.vues || ES.brouillon.etapeFaite(b, k - 1));
      return '<button data-a="etape" data-v="' + k + '" class="' + (rouge ? 'redo' : fait ? 'done' : '') + '"' + (k === n ? ' aria-current="step"' : '') +
        (ouvert ? '' : ' disabled') + ' aria-label="Étape ' + k + ' : ' + titre + (fait ? ' (faite)' : '') + '" title="' + titre + '">' + k + '<span>' + titre + '</span></button>';
    }).join('');
    var haut = '<div class="top"><button class="top__back" data-a="quitter" aria-label="Quitter (le brouillon est gardé)">✕</button>' +
      '<div class="top__t"><strong>' + (b.correctionDe ? 'Correction' : 'Nouvelle fiche') + '</strong><span>Étape ' + n + '/8 · ' + ES.brouillon.ETAPES[n - 1] + '</span></div></div>' +
      '<nav class="steps" aria-label="Étapes de la fiche">' + carres + '</nav>';
    var etapes = [null, etapeChantier, etapeEmplacement, etapeEquipe, etapePoints, etapePoints, etapePoints, etapePhotos, etapeEnvoi];
    var bas = '';
    if (n < 8) {
      var ok = ES.brouillon.etapeFaite(b, n) || n === 7;
      bas = '<div class="foot">' + (ok ? '' : '<p class="foot__hint" id="pourquoi">' + h(ES.brouillon.ceQuiManque(b, n)) + '</p>') +
        '<div class="foot__row"><button class="btn btn--ghost" data-a="precedent"' + (n === 1 ? ' disabled' : '') + '>‹ Retour</button>' +
        '<button class="btn btn--primary" data-a="suivant"' + (ok ? '' : ' disabled aria-describedby="pourquoi"') + '>' + (n === 7 && !ES.etat.photos.length ? 'Passer ›' : 'Suivant ›') + '</button></div></div>';
    }
    return { haut: haut, contenu: bandeauCorrection(b) + etapes[n](b, n), bas: bas };
  }

  // ------------------------------------------------------------ système rouge : fiche renvoyée à corriger
  function aCorriger(b) { return b.aCorriger || []; }
  // étape en rouge tant qu'un de ses points renvoyés n'a pas reçu de nouvelle réponse
  function aReprendre(b, k) {
    if (k < 4 || k > 6) return false;
    return ES.gabarit.sectionsV2()[k - 4].points.some(function (p) { return aCorriger(b).indexOf(p.id) >= 0 && !b.items[p.id]; });
  }
  function bandeauCorrection(b) {
    if (!b.correctionDe) return '';
    var reste = aCorriger(b).filter(function (id) { return !b.items[id]; }).length;
    return '<div class="redbox redbox--fin"><h4>↩ Fiche renvoyée à corriger</h4>' +
      (b.noteCorrection ? '<p>« ' + h(b.noteCorrection) + ' »</p>' : '') +
      '<p>' + (reste ? o.pluriel(reste, 'point') + ' en rouge à reprendre, puis signez et renvoyez.' : 'Tous les points ont été repris : signez et renvoyez à l\'étape 8.') + '</p></div>';
  }

  // ------------------------------------------------------------ mémoire des erreurs du chantier (rappel jusqu'à 1 fiche sans faute)
  async function chargerMemoire(chantierId) {
    ES.etat.memoire = [];
    if (!chantierId) return;
    try { ES.etat.memoire = await root.Cloud.memoire(chantierId); } catch (e) { /* hors réseau : pas de rappel, la fiche reste possible */ }
  }
  function foisOublie(id) {
    var m = (ES.etat.memoire || []).filter(function (x) { return x.point === id; })[0];
    return m ? m.fois : 0;
  }

  // ------------------------------------------------------------ étape 1 : chantier
  function etapeChantier(b) {
    var liste = ES.etat.registre.chantiers || [];
    if (!liste.length) return '<p class="empty">Aucun chantier ne vous est affecté. Demandez au bureau.</p>';
    return '<h3>Sur quel chantier ?</h3><div class="list">' + liste.map(function (c) {
      var choisi = b.chantier_id === c.id;
      return '<button class="row-btn' + (choisi ? ' row-btn--on' : '') + '" data-a="choisir-chantier" data-v="' + c.id + '" aria-pressed="' + choisi + '">' +
        '<div class="row-btn__main"><strong>' + h(c.nom) + '</strong><span>' + h(c.adresse) + ' · ' + o.pluriel(c.batiments.length, 'bâtiment') + '</span></div>' +
        (choisi ? '<b class="coche">✓</b>' : '') + '</button>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------ étape 2 : emplacement (1 seul écran)
  function puce(action, valeur, active, texte, desactivee) {
    return '<button class="chip" data-a="' + action + '" data-v="' + h(valeur) + '" aria-pressed="' + active + '"' + (desactivee ? ' disabled' : '') + '>' + h(texte) + '</button>';
  }
  function champ(titre, contenu, aide) {
    return '<div class="field"><div class="field__l">' + titre + (aide ? ' <small>' + aide + '</small>' : '') + '</div><div class="chips">' + contenu + '</div></div>';
  }
  function etapeEmplacement(b) {
    var c = chantier(b.chantier_id), bt = batiment(c, b.batiment_id), nv = niveau(bt, b.niveau_id);
    var out = champ('Bâtiment', c.batiments.map(function (x) { return puce('choisir-batiment', x.id, b.batiment_id === x.id, x.nom); }).join(''));
    out += champ('Niveau', bt ? bt.niveaux.map(function (x) { return puce('choisir-niveau', x.id, b.niveau_id === x.id, o.nivL(x.num)); }).join('')
      : '<span class="muted">Choisissez d\'abord le bâtiment</span>');
    if (nv) {
      var codes = [];
      for (var k = 1; k <= nv.logements; k++) codes.push(o.codeLogement(nv.num, k));
      var plein = b.logements.length >= ES.brouillon.LOGEMENTS_MAX;
      out += champ('Logements', codes.map(function (cd) {
        var pris = b.logements.indexOf(cd) >= 0;
        return puce('choisir-logement', cd, pris, cd, !pris && plein);
      }).join(''), o.pluriel(b.logements.length, 'choisi') + ' · 6 max');
      if (nv.logements <= ES.brouillon.LOGEMENTS_MAX) out += '<button class="link" data-a="tout-le-niveau">Tout le niveau (' + nv.logements + ')</button>';
      var plan = (c.plans || []).filter(function (p) { return p.niveau_id === nv.id; })[0];
      if (plan) out += '<div><button class="link" data-a="voir-plan" data-v="' + plan.id + '">🗺 Voir le plan de ce niveau</button></div>';
    } else {
      out += champ('Logements', '<span class="muted">Choisissez d\'abord le niveau</span>');
    }
    return out;
  }

  // ------------------------------------------------------------ étape 3 : équipe et dates
  function etapeEquipe(b) {
    var r = ES.etat.registre;
    var jours = [1, 2, 3, 4, 7].map(o.dansJours);
    var out = champ('Date de l\'incorporation', puce('rien', '', true, 'Aujourd\'hui ' + o.frDate(b.date)));
    out += champ('Coulage prévu', jours.map(function (d) { var iso = o.isoJour(d); return puce('choisir-coulage', iso, b.coulage === iso, o.jourCourt(d)); }).join(''));
    out += champ('Chef de chantier', (r.chefs || []).map(function (n) { return puce('choisir-chef', n, b.chef === n, n); }).join(''));
    out += champ('Chef d\'équipe', (r.chefs_equipe || []).map(function (n) { return puce('choisir-chef-equipe', n, b.chef_equipe === n, n); }).join('') || '<span class="muted">aucun</span>', 'facultatif');
    out += champ('Compagnons', (r.compagnons || []).map(function (n) { return puce('choisir-compagnon', n, b.compagnons.indexOf(n) >= 0, n); }).join(''), 'plusieurs possibles');
    return out;
  }

  // ------------------------------------------------------------ étapes 4, 5, 6 : points Fait / Anomalie
  function etapePoints(b, n) {
    var s = ES.gabarit.sectionsV2()[n - 4];
    var faits = s.points.filter(function (p) { return b.items[p.id]; }).length;
    var anomalies = s.points.filter(function (p) { return b.items[p.id] === 'KO'; }).length;
    var out = s.alerte ? '<div class="alert">⚠ ' + h(s.alerte) + '</div>' : '';
    var oublies = s.points.filter(function (p) { return foisOublie(p.id); });
    if (oublies.length) out += '<div class="warnbox"><b>🧠 Déjà oublié sur ce chantier</b><ul>' + oublies.map(function (p) {
      return '<li>' + h(p.label) + ' <small>(' + foisOublie(p.id) + '×)</small></li>';
    }).join('') + '</ul><small>Rappel affiché jusqu\'à une fiche sans faute sur ce chantier.</small></div>';
    out += '<div class="pt-head"><div class="counter">' + faits + '/' + s.points.length + ' points<small>' + h(s.long) +
      (anomalies ? ' · <b class="txt-ko">' + o.pluriel(anomalies, 'anomalie') + '</b>' : '') + '</small></div>' +
      '<button class="btn btn--sm btn--ok" data-a="tout-fait" data-v="' + n + '">✓ Tout fait</button>' +
      '<button class="qbtn" data-a="guide" data-v="' + n + '" aria-label="Guide : ' + h(s.titre) + '">?</button></div>';
    out += s.points.map(function (p) {
      var r = b.items[p.id], redo = aCorriger(b).indexOf(p.id) >= 0, fois = foisOublie(p.id);
      return '<div class="pt' + (r === 'OK' ? ' is-ok' : r === 'KO' ? ' is-ko' : '') + (redo && !r ? ' pt--redo' : '') + '">' +
        '<div class="pt__l" id="l-' + p.id + '">' + h(p.label) +
        (redo ? ' <span class="pill p-ko">↩ à corriger</span>' : '') + (fois ? ' <span class="pill p-oubli">oublié ' + fois + '×</span>' : '') + '</div>' +
        '<div class="pt__b" role="group" aria-labelledby="l-' + p.id + '">' +
        '<button class="b-ok" data-a="reponse" data-v="' + p.id + '|OK" aria-pressed="' + (r === 'OK') + '">✓ Fait</button>' +
        '<button class="b-ko" data-a="reponse" data-v="' + p.id + '|KO" aria-pressed="' + (r === 'KO') + '">✗ Anomalie</button></div>' +
        (r === 'KO' ? '<textarea rows="2" maxlength="500" data-saisie="note" data-v="' + p.id + '" placeholder="Que se passe-t-il ? (facultatif)" aria-label="Note sur l\'anomalie">' + h(b.notes[p.id] || '') + '</textarea>' : '') +
        '</div>';
    }).join('');
    return out;
  }

  // ------------------------------------------------------------ étape 7 : photos (facultatives)
  function etapePhotos(b) {
    if (b.vues < 8) { b.vues = 8; enregistrer(); }
    var photos = ES.etat.photos, plein = photos.length >= ES.photos.MAX;
    return '<p class="lead">Facultatif. ' + ES.photos.MAX + ' photos maximum, réduites automatiquement (environ 300 Ko chacune). Elles partent avec la fiche.</p>' +
      '<div class="ph-btns">' +
      '<label class="btn btn--primary">📷 Photo<input type="file" accept="image/*" capture="environment" data-saisie="photo"' + (plein ? ' disabled' : '') + '></label>' +
      '<label class="btn btn--ghost">🖼 Galerie<input type="file" accept="image/*" multiple data-saisie="photo"' + (plein ? ' disabled' : '') + '></label></div>' +
      '<div class="field__l">Photos jointes <small>' + photos.length + '/' + ES.photos.MAX + '</small></div>' +
      (photos.length ? '<div class="ph-grid">' + photos.map(function (p, i) {
        return '<div class="ph"><img src="' + ES.photos.apercu(p) + '" alt="Photo ' + (i + 1) + '"><span class="ph__kb">' +
          ES.photos.poidsLisible(p.poidsAvant || p.blob.size) + ' → ' + Math.round(p.blob.size / 1024) + ' Ko</span>' +
          '<button class="ph__x" data-a="retirer-photo" data-v="' + p.id + '" aria-label="Retirer la photo ' + (i + 1) + '">✕</button></div>';
      }).join('') + '</div>' : '<p class="empty empty--cadre">Aucune photo pour l\'instant</p>') +
      '<div class="info"><b>📸 Photos Alobees toujours obligatoires avant coulage</b><ul>' +
      ES.gabarit.photosAlobees().map(function (t) { return '<li>' + h(t) + '</li>'; }).join('') + '</ul></div>';
  }

  // ------------------------------------------------------------ étape 8 : vérification, signature, envoi
  function destinataires(b) {
    var c = chantier(b.chantier_id), auteur = ES.etat.profil.nom;
    var bureau = [c.conducteur ? c.conducteur + ' (conducteur)' : 'le conducteur du chantier', 'la direction'];
    if (b.chef && b.chef !== auteur) bureau.push(b.chef + ' (chef de chantier)');
    var equipe = [b.chef_equipe].concat(b.compagnons).filter(function (n) { return n && n !== auteur; });
    return { bureau: bureau, equipe: equipe };
  }
  function etapeEnvoi(b) {
    var points = ES.gabarit.tousLesPoints();
    var anomalies = points.filter(function (p) { return b.items[p.id] === 'KO'; });
    var faits = points.filter(function (p) { return b.items[p.id]; }).length;
    var d = destinataires(b), pret = b.lu && !!b.signature;
    var c = chantier(b.chantier_id);
    return '<div class="recap"><div class="recap__sur">Récapitulatif</div><div class="recap__big">' + faits + '/' + points.length + ' points ✓ · ' +
      '<span class="' + (anomalies.length ? 'txt-ko' : '') + '">' + o.pluriel(anomalies.length, 'anomalie') + '</span></div>' +
      '<div class="muted">' + h(c.nom) + ' · ' + h(lieu(b)) + ' · coulage ' + o.frDate(b.coulage) + '</div>' +
      '<div class="muted">' + o.pluriel(ES.etat.photos.length, 'photo') + ' · ' + h([b.chef, b.chef_equipe].concat(b.compagnons).filter(Boolean).join(', ')) + '</div>' +
      (anomalies.length ? '<div class="txt-ko recap__ko">' + anomalies.map(function (p) { return '✗ ' + h(p.label); }).join('<br>') + '</div>' : '') + '</div>' +
      '<div class="field"><div class="field__l">Observations <small>facultatif</small></div><textarea rows="2" maxlength="2000" data-saisie="observations" placeholder="Une remarque pour le conducteur ?">' + h(b.observations) + '</textarea></div>' +
      '<div class="info"><b>La fiche sera envoyée à :</b><br>🏢 ' + d.bureau.map(h).join(' · ') +
      (d.equipe.length ? '<br>👷 Équipe (reçoit la fiche et le plan) : ' + d.equipe.map(h).join(' · ') : '') + '</div>' +
      '<label class="check check--petit"><input type="checkbox" data-a="excel-demande"' + (b.excel_demande ? ' checked' : '') + '>' +
      '<span>Envoyer l\'Excel à la facturation une fois la fiche validée<small>Le serveur l\'envoie en pièce jointe dès que le conducteur valide</small></span></label>' +
      '<div class="redbox"><h4>⚠ À LIRE AVANT D\'ENVOYER</h4><ul>' + ES.gabarit.rappels().map(function (r) { return '<li>' + h(r) + '</li>'; }).join('') + '</ul>' +
      '<label class="check"><input type="checkbox" data-a="lu"' + (b.lu ? ' checked' : '') + '> J\'ai tout lu et vérifié</label></div>' +
      '<div class="field"><div class="field__l">Signature <small>avec le doigt</small></div>' +
      '<div class="sign"><canvas data-signature aria-label="Zone de signature : dessinez avec le doigt"></canvas>' + (b.signature ? '' : '<span class="sign__ph">Signez ici</span>') + '</div>' +
      '<div class="sign__pied"><span class="muted">' + h(ES.etat.profil.nom) + ' · le ' + o.frDate(b.date) + '</span>' + (b.signature ? '<button class="link" data-a="effacer-signature">Effacer</button>' : '') + '</div></div>' +
      '<div class="send-zone"><button class="btn btn--gold btn--big" data-a="envoyer"' + (pret ? '' : ' disabled aria-describedby="pourquoi-envoi"') + '>➤ ENVOYER AU BUREAU</button>' +
      (pret ? '' : '<p class="foot__hint" id="pourquoi-envoi">' + (!b.lu ? 'Cochez « J\'ai tout lu et vérifié »' + (b.signature ? '' : ' et signez') : 'Signez') + ' pour envoyer</p>') +
      '<button class="btn btn--ghost btn--block" data-a="excel">⬇ Télécharger l\'Excel</button></div>';
  }

  // ------------------------------------------------------------ fiche prête pour l'envoi et pour l'Excel
  function ficheAEnvoyer(b) {
    var c = chantier(b.chantier_id), bt = batiment(c, b.batiment_id), nv = niveau(bt, b.niveau_id);
    var items = {};
    ES.gabarit.tousLesPoints().forEach(function (p) { if (b.items[p.id]) items[p.id] = b.items[p.id]; });
    var notes = {};
    Object.keys(b.notes).forEach(function (id) { if (items[id] === 'KO' && b.notes[id].trim()) notes[id] = b.notes[id].trim(); });
    return {
      id: b.id, serverVersion: b.serverVersion || 0,
      chantier_id: b.chantier_id, batiment_id: b.batiment_id, niveau_id: b.niveau_id, logements: b.logements,
      date: b.date, coulage: b.coulage, chef: b.chef, chef_equipe: b.chef_equipe, compagnons: b.compagnons,
      controleur: ES.etat.profil.nom, observations: b.observations, items: items, notes: notes, libres: {},
      plan_indice: b.plan_indice, signature: b.signature, signatureRatio: b.signatureRatio, excel_demande: !!b.excel_demande,
      // noms lisibles pour l'Excel (identique à la fiche papier)
      chantier: c.nom, batiment: bt.nom, niveau: o.nivL(nv.num)
    };
  }
  // une fiche du serveur, mise au format de l'Excel (noms lisibles, comme la fiche papier)
  function ficheExcelDepuisServeur(f) {
    var c = chantier(f.chantier_id), bt = batiment(c, f.batiment_id), nv = niveau(bt, f.niveau_id);
    return {
      id: f.id, chantier_id: f.chantier_id, batiment_id: f.batiment_id, niveau_id: f.niveau_id, logements: f.logements,
      date: f.date_fiche, coulage: f.coulage, chef: f.chef, chef_equipe: f.chef_equipe, compagnons: f.compagnons || [],
      controleur: f.controleur, observations: f.observations || '', items: f.items || {}, notes: f.notes || {}, libres: {},
      plan_indice: f.plan_indice, signature: f.signature, signatureRatio: f.signature_ratio,
      chantier: c ? c.nom : '', batiment: bt ? bt.nom : '', niveau: nv ? o.nivL(nv.num) : ''
    };
  }
  async function genererExcel(fiche) {
    var contenu = await ES.gabarit.charger();
    var modele = await (await fetch('modele/fiche_modele.xlsx')).arrayBuffer();
    return root.FicheXlsx.generer(root.ExcelJS, modele, contenu, fiche);
  }
  async function telechargerExcel(fiche) {
    var octets = await genererExcel(fiche);
    var lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    lien.download = root.FicheXlsx.nomFichier(fiche);
    document.body.appendChild(lien); lien.click(); lien.remove();
  }

  // ------------------------------------------------------------ actions
  function basculer(liste, valeur) {
    return liste.indexOf(valeur) >= 0 ? liste.filter(function (x) { return x !== valeur; }) : liste.concat([valeur]);
  }
  var ACTIONS = {
    'etape': function (v) { brouillon().etape = +v; },
    'precedent': function () { var b = brouillon(); b.etape = Math.max(1, b.etape - 1); },
    'suivant': function () { var b = brouillon(); b.etape = Math.min(8, b.etape + 1); b.vues = Math.max(b.vues, b.etape); },
    'choisir-chantier': function (v) {
      var b = brouillon();
      if (b.chantier_id !== v) Object.assign(b, { chantier_id: v, batiment_id: null, niveau_id: null, logements: [], plan_indice: null });
      var c = chantier(v);
      if (c.batiments.length === 1) b.batiment_id = c.batiments[0].id;   // un seul bâtiment : déjà choisi
      return chargerMemoire(v);
    },
    'choisir-batiment': function (v) { var b = brouillon(); if (b.batiment_id !== v) Object.assign(b, { batiment_id: v, niveau_id: null, logements: [] }); },
    'choisir-niveau': function (v) { var b = brouillon(); if (b.niveau_id !== v) Object.assign(b, { niveau_id: v, logements: [] }); },
    'choisir-logement': function (v) { var b = brouillon(); b.logements = basculer(b.logements, v).sort(); },
    'tout-le-niveau': function () {
      var b = brouillon(), nv = niveau(batiment(chantier(b.chantier_id), b.batiment_id), b.niveau_id);
      b.logements = [];
      for (var k = 1; k <= nv.logements; k++) b.logements.push(o.codeLogement(nv.num, k));
    },
    'voir-plan': async function (v) {
      var plan = (chantier(brouillon().chantier_id).plans || []).filter(function (p) { return p.id === v; })[0];
      try { root.open(await root.Cloud.urlPlan(plan), '_blank', 'noopener'); }
      catch (e) { o.toast('Plan indisponible sans réseau'); }
    },
    'choisir-coulage': function (v) { brouillon().coulage = v; },
    'choisir-chef': function (v) { brouillon().chef = v; },
    'choisir-chef-equipe': function (v) { var b = brouillon(); b.chef_equipe = b.chef_equipe === v ? null : v; },
    'choisir-compagnon': function (v) { var b = brouillon(); b.compagnons = basculer(b.compagnons, v); },
    'reponse': function (v) {
      var b = brouillon(), morceaux = v.split('|');
      if (b.items[morceaux[0]] === morceaux[1]) delete b.items[morceaux[0]]; else b.items[morceaux[0]] = morceaux[1];
    },
    'tout-fait': function (v) {
      var b = brouillon();
      ES.gabarit.sectionsV2()[+v - 4].points.forEach(function (p) { if (!b.items[p.id]) b.items[p.id] = 'OK'; });
    },
    'guide': function (v) { ES.etat.feuille = { type: 'guide', etape: +v }; },
    'retirer-photo': async function (v) {
      await ES.photos.retirer(brouillon().id, v);
      ES.etat.photos = await ES.photos.liste(brouillon().id);
    },
    'lu': function (v, ev) { brouillon().lu = ev.target.checked; },
    'excel-demande': function (v, ev) { brouillon().excel_demande = ev.target.checked; },
    'effacer-signature': function () { var b = brouillon(); b.signature = null; b.signatureRatio = null; },
    'excel': async function () {
      try { await telechargerExcel(ficheAEnvoyer(brouillon())); } catch (e) { o.toast('Excel impossible : ' + e.message); }
    },
    'envoyer': async function () {
      var b = brouillon(), fiche = ficheAEnvoyer(b);
      await root.Cloud.mettreEnFile(fiche);       // gardée sur le téléphone jusqu'à l'accusé du serveur
      ES.brouillon.effacer();
      ES.etat.brouillon = null;
      ES.etat.photos = [];
      ES.etat.ecran = { n: 'envoyee', id: fiche.id };
      ES.app.synchroniser();
    },
    'quitter': function () { ES.etat.ecran = { n: 'accueil' }; o.toast('Brouillon gardé sur le téléphone'); }
  };
  // toute action de l'assistant enregistre le brouillon (on peut fermer l'appli à tout moment)
  Object.keys(ACTIONS).forEach(function (nom) {
    var action = ACTIONS[nom];
    ACTIONS[nom] = async function (v, ev) {
      await action(v, ev);
      if (ES.etat.brouillon) enregistrer();
    };
  });

  // saisies au clavier (sans réafficher l'écran, pour ne pas perdre le curseur)
  function saisie(el) {
    var b = brouillon();
    if (!b) return;
    if (el.dataset.saisie === 'note') b.notes[el.dataset.v] = el.value;
    else if (el.dataset.saisie === 'observations') b.observations = el.value;
    enregistrer();
  }
  async function photosChoisies(el) {
    var b = brouillon();
    var illisibles = await ES.photos.ajouter(b.id, el.files);
    ES.etat.photos = await ES.photos.liste(b.id);
    if (illisibles) o.toast(o.pluriel(illisibles, 'photo') + ' illisible(s)');
  }
  function apresAffichage(racine) {
    var toile = racine.querySelector('canvas[data-signature]');
    if (!toile) return;
    ES.signature.brancher(toile, brouillon().signature, function (image, ratio) {
      var b = brouillon();
      b.signature = image; b.signatureRatio = ratio;
      enregistrer();
      ES.app.afficher();
    });
  }
  function feuilleGuide(etape) {
    var s = ES.gabarit.sectionsV2()[etape - 4];
    return '<div class="sheet__h"><strong>Guide : ' + h(s.long) + '</strong><button class="x" data-a="fermer-feuille" aria-label="Fermer">✕</button></div>' +
      '<div class="guide"><h5 class="txt-ok">✓ À faire</h5><ul>' + s.guide.faire.map(function (t) { return '<li>' + h(t) + '</li>'; }).join('') + '</ul>' +
      '<h5 class="txt-ko">⚠ Attention</h5><ul>' + s.guide.attention.map(function (t) { return '<li>' + h(t) + '</li>'; }).join('') + '</ul></div>';
  }

  ES.assistant = { vue: vue, ACTIONS: ACTIONS, saisie: saisie, photosChoisies: photosChoisies, apresAffichage: apresAffichage,
    feuilleGuide: feuilleGuide, lieu: lieu, chantier: chantier, telechargerExcel: telechargerExcel, chargerMemoire: chargerMemoire,
    genererExcel: genererExcel, ficheExcelDepuisServeur: ficheExcelDepuisServeur };
})(window);
