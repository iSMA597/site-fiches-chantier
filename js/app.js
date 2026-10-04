/*
 * Euro Sanichauff – application « Fiches chantier » (Projet 3, ADR-0008)
 * Saisie pas à pas sur téléphone, génération de la fiche Excel (même rendu que le Projet 1)
 * et envoi par le partage du téléphone, par un relais automatique ou par mail.
 */
(function () {
  'use strict';

  var FX = window.FicheXlsx;
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var KEYS = { config: 'es_config', settings: 'es_settings', draft: 'es_draft', history: 'es_history' };
  var VERSION = '1.3.0';

  var S = { contenu: null, modele: null, config: null, settings: null, fiche: null, step: 0, sentInfo: null };
  var $view = document.getElementById('view');
  var $nav = document.getElementById('nav');
  var $back = document.getElementById('btnBack');
  var $next = document.getElementById('btnNext');

  // ------------------------------------------------------------ stockage local
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    if (key === KEYS.history && Array.isArray(value)) {
      value = value.map(function (e, i) {
        if (i < 5 || !e.fiche || !e.fiche.signature) return e;
        var c = Object.assign({}, e, { fiche: Object.assign({}, e.fiche) });
        delete c.fiche.signature;
        return c;
      });
    }
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignoré */ } }

  // ------------------------------------------------------------ utilitaires
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function title(main, sub) {
    document.getElementById('topTitle').textContent = main;
    document.getElementById('topSub').textContent = sub || 'Incorporations avant coulage';
  }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  // identifiant universel : une fiche renvoyée après une coupure n'est jamais dupliquée sur le serveur
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var hx = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return hx.slice(0, 8) + '-' + hx.slice(8, 12) + '-' + hx.slice(12, 16) + '-' + hx.slice(16, 20) + '-' + hx.slice(20);
  }

  // ------------------------------------------------------------ configuration
  function defaultSettings() {
    return { email: 'facture.eurosanichauff@gmail.com', mode: 'partage', relaisUrl: '', relaisCle: '', monNom: '' };
  }
  function chantiers() { return (S.config && S.config.chantiers) || []; }
  function chantierCourant() {
    return chantiers().filter(function (c) { return c.nom === S.fiche.chantier; })[0];
  }
  function batimentCourant() {
    var c = chantierCourant();
    return c && c.batiments.filter(function (b) { return b.nom === S.fiche.batiment; })[0];
  }
  function niveauCourant() {
    var b = batimentCourant();
    return b && b.niveaux.filter(function (n) { return FX.niveauLabel(n.num) === S.fiche.niveau; })[0];
  }

  function fusionConfig(base, ajout) {
    var out = JSON.parse(JSON.stringify(base || { chantiers: [], chefs: [], chefs_equipe: [], compagnons: [] }));
    (ajout.chantiers || []).forEach(function (c) {
      out.chantiers = out.chantiers.filter(function (x) { return x.nom !== c.nom; });
      out.chantiers.push(c);
    });
    ['chefs', 'chefs_equipe', 'compagnons'].forEach(function (k) {
      out[k] = uniq((out[k] || []).concat(ajout[k] || []));
    });
    // on retire les exemples dès qu'un vrai chantier est importé
    if ((ajout.chantiers || []).some(function (c) { return !/^EXEMPLE/i.test(c.nom); })) {
      out.chantiers = out.chantiers.filter(function (c) { return !/^EXEMPLE/i.test(c.nom); });
      ['chefs', 'chefs_equipe', 'compagnons'].forEach(function (k) {
        out[k] = out[k].filter(function (n) { return !/^EXEMPLE/i.test(n); });
      });
    }
    return out;
  }

  // ------------------------------------------------------------ fiche
  function nouvelleFiche(base) {
    var f = {
      id: uuid(), chantier: '', batiment: '', niveau: '', logements: [],
      date: todayISO(), coulage: '', chef: '', chef_equipe: '', compagnons: [],
      controleur: '', observations: '', items: {}, libres: {}, signature: null, signatureRatio: 3
    };
    if (base) {
      ['chantier', 'batiment', 'niveau', 'date', 'coulage', 'chef', 'chef_equipe', 'controleur'].forEach(function (k) {
        f[k] = base[k];
      });
      f.compagnons = (base.compagnons || []).slice();
    } else if (S.settings.monNom) {
      f.compagnons = [S.settings.monNom];
    }
    return f;
  }
  function saveDraft() {
    if (!S.fiche) return;
    if (!save(KEYS.draft, { fiche: S.fiche, step: S.step }) && !saveDraft.alerte) {
      saveDraft.alerte = true;
      toast('Mémoire du téléphone pleine : la fiche en cours n’est plus sauvegardée. Envoyez-la ou libérez de la place.', 7000);
    }
  }
  // démarre une fiche sans écraser en silence un brouillon en cours
  function demarrerFiche(base, etape, ficheExistante) {
    var d = load(KEYS.draft, null);
    var cible = ficheExistante ? JSON.parse(JSON.stringify(ficheExistante)) : null;
    if (d && d.fiche && d.fiche.chantier && (!cible || d.fiche.id !== cible.id)) {
      var lib = [d.fiche.batiment, d.fiche.niveau, (d.fiche.logements || []).join(' ')].filter(Boolean).join(' · ');
      if (!confirm('Une fiche en cours (' + (lib || d.fiche.chantier) + ') n’est pas envoyée.\nElle sera remplacée. Continuer ?')) return;
      if (window.Cloud) Cloud.supprimerPhotos(d.fiche.id);
    }
    S.fiche = cible || nouvelleFiche(base);
    go(etape || 0);
  }

  // ------------------------------------------------------------ étapes
  var STEPS = [];
  function buildSteps() {
    STEPS = [
      { id: 'chantier', render: stepChantier, valid: function () { return !!S.fiche.chantier || 'Choisissez un chantier.'; } },
      { id: 'batiment', render: stepBatiment, valid: function () { return !!S.fiche.batiment || 'Choisissez un bâtiment.'; } },
      { id: 'niveau', render: stepNiveau, valid: function () { return !!S.fiche.niveau || 'Choisissez un niveau.'; } },
      { id: 'logements', render: stepLogements, valid: function () { return S.fiche.logements.length > 0 || 'Choisissez au moins un logement.'; } },
      { id: 'infos', render: stepInfos, valid: function () { return !!S.fiche.date || 'Indiquez la date.'; } }
    ];
    S.contenu.sections.forEach(function (sec) {
      STEPS.push({ id: 's' + sec.n, render: function () { stepSection(sec); }, valid: function () { return true; } });
    });
    STEPS.push({ id: 'recap', render: stepRecap, valid: function () { return true; } });
  }

  function go(i) {
    S.step = Math.max(0, Math.min(STEPS.length - 1, i));
    saveDraft();
    renderStep();
  }
  function renderStep() {
    $view.innerHTML = '';
    $view.className = 'view';
    $nav.hidden = false;
    document.getElementById('progress').hidden = false;
    document.getElementById('progressBar').style.width = Math.round((S.step + 1) / STEPS.length * 100) + '%';
    $back.textContent = S.step === 0 ? 'Accueil' : 'Retour';
    var last = S.step === STEPS.length - 1;
    $next.hidden = last;
    $nav.style.gridTemplateColumns = last ? '1fr' : '';
    $next.textContent = S.step === STEPS.length - 2 ? 'Voir le récapitulatif' : 'Suivant';
    title(S.fiche.chantier || 'Nouvelle fiche',
      [S.fiche.batiment, S.fiche.niveau, S.fiche.logements.join(' ')].filter(Boolean).join(' · ') || 'Étape ' + (S.step + 1) + ' / ' + STEPS.length);
    $view.appendChild(stepper());
    STEPS[S.step].render();
    window.scrollTo(0, 0);
  }

  // carrés d'étapes cliquables : on revient directement à une étape sans tout refaire
  var LIBELLES = { chantier: 'Chantier', batiment: 'Bâtiment', niveau: 'Niveau', logements: 'Logements', infos: 'Équipe',
    s1: 'Documents', s2: 'Matériel', s3: 'Contrôles', s4: 'Photos', s5: 'Validation', recap: 'Envoi' };
  function etapeFaite(i) {
    var st = STEPS[i];
    if (st.id === 'recap') return false;
    if (st.id.charAt(0) === 's' && st.id.length === 2) {
      var sec = S.contenu.sections[+st.id.charAt(1) - 1];
      return sec.items.every(function (it) {
        return (it.libre && !S.fiche.libres[it.id]) || S.fiche.items[it.id] === 'OK' || S.fiche.items[it.id] === 'KO';
      });
    }
    return st.valid() === true;
  }
  function sauterA(i) {
    for (var j = 0; j < i; j++) {
      var v = STEPS[j].valid();
      if (v !== true) { toast(v); go(j); return; }
    }
    go(i);
  }
  function stepper() {
    return h('nav', { class: 'stepper', 'aria-label': 'Étapes de la fiche' }, STEPS.map(function (st, i) {
      var etat = i === S.step ? 'cur' : (etapeFaite(i) ? 'ok' : 'todo');
      return h('button', { class: 'stepper__b stepper__b--' + etat, title: LIBELLES[st.id] || st.id,
        'aria-current': i === S.step ? 'step' : null, onclick: function () { sauterA(i); } },
        [h('b', { text: String(i + 1) }), h('span', { text: LIBELLES[st.id] || '' })]);
    }));
  }
  $back.addEventListener('click', function () { if (S.step === 0) home(); else go(S.step - 1); });
  $next.addEventListener('click', function () {
    var v = STEPS[S.step].valid();
    if (v !== true) { toast(v); return; }
    go(S.step + 1);
  });
  document.getElementById('btnHome').addEventListener('click', home);

  function choiceList(items, current, onPick, grid) {
    return h('div', { class: 'choices' + (grid ? ' choices--grid' : '') }, items.map(function (it) {
      return h('button', {
        class: 'choice', 'aria-pressed': String(it.value === current),
        onclick: function () { onPick(it.value); }
      }, [it.label, it.sub ? h('small', { text: it.sub }) : null]);
    }));
  }

  function stepChantier() {
    var list = chantiers();
    $view.appendChild(h('span', { class: 'step-tag', text: 'Étape 1' }));
    $view.appendChild(h('h1', { text: 'Chantier' }));
    if (!list.length) {
      $view.appendChild(h('p', { class: 'lead', text: 'Aucun chantier. Importez la configuration exportée du classeur (Paramètres).' }));
      $view.appendChild(h('button', { class: 'btn btn--gold btn--block', text: 'Paramètres', onclick: settingsView }));
      return;
    }
    $view.appendChild(h('p', { class: 'lead', text: 'Touchez le chantier.' }));
    $view.appendChild(choiceList(list.map(function (c) {
      var n = c.batiments.reduce(function (a, b) { return a + b.niveaux.reduce(function (x, y) { return x + y.logements; }, 0); }, 0);
      return { value: c.nom, label: c.nom, sub: (c.adresse ? c.adresse + ' · ' : '') + c.batiments.length + ' bât. · ' + n + ' logements' };
    }), S.fiche.chantier, function (v) {
      if (v !== S.fiche.chantier) { S.fiche.batiment = ''; S.fiche.niveau = ''; S.fiche.logements = []; }
      S.fiche.chantier = v;
      go(S.step + 1);
    }));
  }

  function stepBatiment() {
    var c = chantierCourant();
    $view.appendChild(h('span', { class: 'step-tag', text: 'Étape 2' }));
    $view.appendChild(h('h1', { text: 'Bâtiment' }));
    if (!c) { $view.appendChild(h('p', { class: 'lead', text: 'Chantier introuvable : revenez à l\'étape 1.' })); return; }
    $view.appendChild(choiceList(c.batiments.map(function (b) {
      return { value: b.nom, label: b.nom, sub: b.niveaux.length + ' niveau(x)' };
    }), S.fiche.batiment, function (v) {
      if (v !== S.fiche.batiment) { S.fiche.niveau = ''; S.fiche.logements = []; }
      S.fiche.batiment = v;
      go(S.step + 1);
    }, true));
  }

  function stepNiveau() {
    var b = batimentCourant();
    $view.appendChild(h('span', { class: 'step-tag', text: 'Étape 3' }));
    $view.appendChild(h('h1', { text: 'Zone / niveau' }));
    if (!b) { $view.appendChild(h('p', { class: 'lead', text: 'Bâtiment introuvable : revenez à l\'étape 2.' })); return; }
    $view.appendChild(choiceList(b.niveaux.map(function (n) {
      return { value: FX.niveauLabel(n.num), label: FX.niveauLabel(n.num), sub: n.logements + ' logt' };
    }), S.fiche.niveau, function (v) {
      if (v !== S.fiche.niveau) S.fiche.logements = [];
      S.fiche.niveau = v;
      go(S.step + 1);
    }, true));
  }

  function stepLogements() {
    var n = niveauCourant(), max = S.contenu.nb_logements_fiche;
    $view.appendChild(h('span', { class: 'step-tag', text: 'Étape 4' }));
    $view.appendChild(h('h1', { text: 'Logement(s)' }));
    $view.appendChild(h('p', { class: 'lead', text: 'Touchez les logements traités sur cette fiche (' + max + ' maximum). ' + S.contenu.hint_logement.split('—')[0].trim() + '.' }));
    if (!n) { $view.appendChild(h('p', { class: 'lead', text: 'Niveau introuvable.' })); return; }
    var codes = [];
    for (var k = 1; k <= n.logements; k++) codes.push(FX.codeLogement(n.num, k));
    var grid = h('div', { class: 'choices choices--grid' });
    function draw() {
      grid.innerHTML = '';
      codes.forEach(function (code) {
        var on = S.fiche.logements.indexOf(code) >= 0;
        grid.appendChild(h('button', {
          class: 'choice', 'aria-pressed': String(on), text: code,
          onclick: function () {
            var i = S.fiche.logements.indexOf(code);
            if (i >= 0) S.fiche.logements.splice(i, 1);
            else if (S.fiche.logements.length >= max) { toast(max + ' logements maximum par fiche : faites une fiche suivante.'); return; }
            else S.fiche.logements.push(code);
            S.fiche.logements.sort();
            saveDraft();
            draw();
            title(S.fiche.chantier, [S.fiche.batiment, S.fiche.niveau, S.fiche.logements.join(' ')].join(' · '));
          }
        }));
      });
    }
    draw();
    $view.appendChild(grid);
    if (window.Plateforme && window.Plateforme.actif()) {
      var bp = window.Plateforme.boutonPlansFiche();
      if (bp) $view.appendChild(bp);
    }
  }

  function chipsSelect(options, selected, multi, onChange) {
    var box = h('div', { class: 'chips' });
    function draw() {
      box.innerHTML = '';
      options.forEach(function (o) {
        var on = multi ? selected().indexOf(o) >= 0 : selected() === o;
        box.appendChild(h('button', {
          class: 'chip', 'aria-pressed': String(on), text: o,
          onclick: function () { onChange(o, on); draw(); saveDraft(); }
        }));
      });
    }
    draw();
    return box;
  }

  function stepInfos() {
    var f = S.fiche, cfg = S.config;
    $view.appendChild(h('span', { class: 'step-tag', text: 'Étape 5' }));
    $view.appendChild(h('h1', { text: 'Dates et équipe' }));
    function dateField(lab, key) {
      return h('div', { class: 'field' }, [
        h('label', { text: lab, for: 'f_' + key }),
        h('input', { class: 'input', type: 'date', id: 'f_' + key, value: f[key] || '',
          onchange: function (e) { f[key] = e.target.value; saveDraft(); } })
      ]);
    }
    $view.appendChild(dateField('Date', 'date'));
    $view.appendChild(dateField('Coulage prévu', 'coulage'));
    $view.appendChild(h('h2', { text: 'Chef de chantier' }));
    $view.appendChild(chipsSelect(cfg.chefs || [], function () { return f.chef; }, false,
      function (o, on) { f.chef = on ? '' : o; }));
    $view.appendChild(h('h2', { text: 'Chef d\'équipe' }));
    $view.appendChild(chipsSelect(cfg.chefs_equipe || [], function () { return f.chef_equipe; }, false,
      function (o, on) { f.chef_equipe = on ? '' : o; }));
    $view.appendChild(h('h2', { text: 'Compagnons' }));
    var comps = uniq((cfg.compagnons || []).concat(f.compagnons));
    $view.appendChild(chipsSelect(comps, function () { return f.compagnons; }, true, function (o, on) {
      if (on) f.compagnons = f.compagnons.filter(function (x) { return x !== o; });
      else f.compagnons.push(o);
    }));
  }

  function stepSection(sec) {
    var f = S.fiche;
    $view.appendChild(h('span', { class: 'step-tag', text: 'Contrôles ' + sec.n + ' / ' + S.contenu.sections.length }));
    var head = h('div', { class: 'section-head' }, [h('h1', { text: sec.titre.charAt(0) + sec.titre.slice(1).toLowerCase() })]);
    $view.appendChild(head);
    if (sec.alerte) $view.appendChild(h('div', { class: 'alert', text: '⚠ ' + sec.alerte }));
    var list = h('div');
    function draw() {
      list.innerHTML = '';
      sec.items.forEach(function (it) {
        var v = f.items[it.id] || '';
        var card = h('div', { class: 'item' + (v === 'OK' ? ' item--ok' : v === 'KO' ? ' item--ko' : '') });
        if (it.libre) {
          card.appendChild(h('input', {
            class: 'input', placeholder: 'Autre matériel (facultatif)', value: f.libres[it.id] || '',
            oninput: function (e) {
              f.libres[it.id] = e.target.value;
              if (!e.target.value) delete f.items[it.id];
              saveDraft();
            }
          }));
        } else {
          card.appendChild(h('div', { class: 'item__label', text: it.label }));
        }
        function set(val) {
          if (it.libre && !f.libres[it.id]) { toast('Écrivez d\'abord le matériel.'); return; }
          f.items[it.id] = (f.items[it.id] === val) ? '' : val;
          saveDraft();
          draw();
        }
        card.appendChild(h('div', { class: 'item__btns' }, [
          h('button', { class: 'tog tog--ok', 'aria-pressed': String(v === 'OK'), text: '✓  Fait', onclick: function () { set('OK'); } }),
          h('button', { class: 'tog tog--ko', 'aria-pressed': String(v === 'KO'), text: '✗  Anomalie', onclick: function () { set('KO'); } })
        ]));
        list.appendChild(card);
      });
    }
    head.appendChild(h('button', {
      class: 'btn btn--ok', text: 'Tout fait', onclick: function () {
        sec.items.forEach(function (it) {
          if (it.libre && !f.libres[it.id]) return;
          if (f.items[it.id] !== 'KO') f.items[it.id] = 'OK';
        });
        saveDraft();
        draw();
      }
    }));
    draw();
    $view.appendChild(list);
    if (sec.note) $view.appendChild(h('div', { class: 'note', text: sec.note }));
    if (sec.n === 4) $view.appendChild(blocPhotos());
    var g = (S.contenu.guide || {})[String(sec.n)];
    if (g) {
      var boite = h('div', { class: 'guide', hidden: true }, [
        h('strong', { text: 'Comment faire' }), h('ul', {}, g.faire.map(function (t) { return h('li', { text: t }); })),
        h('strong', { text: 'Attention' }), h('ul', { class: 'guide__att' }, g.attention.map(function (t) { return h('li', { text: t }); }))
      ]);
      head.insertBefore(h('button', { class: 'btn btn--ghost btn--rond', 'aria-label': 'Guide de cette étape', text: '?',
        onclick: function () { boite.hidden = !boite.hidden; } }), head.lastChild);
      head.parentNode.insertBefore(boite, head.nextSibling);
    }
    if (sec.validation) validationExtras();
  }

  // ------------------------------------------------------------ photos jointes (facultatives, ne bloquent pas)
  function compresser(fichier) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, hh = img.naturalHeight, k = Math.min(1, max / Math.max(w, hh));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(hh * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('photo illisible')); }, 'image/jpeg', 0.72);
      };
      img.onerror = function () { URL.revokeObjectURL(img.src); rej(new Error('photo illisible')); };
      img.src = URL.createObjectURL(fichier);
    });
  }
  function blocPhotos() {
    var f = S.fiche;
    var box = h('div', { class: 'card' }, [
      h('strong', { text: 'Photos jointes à la fiche (facultatif)' }),
      h('p', { class: 'muted', text: 'En plus des photos Alobees. Elles partent avec la fiche (10 maximum).' })
    ]);
    if (!window.Cloud) return box;
    var grille = h('div', { class: 'thumbs' });
    var input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, hidden: true,
      onchange: async function (e) {
        var liste = await Cloud.photos(f.id);
        var fichiers = Array.prototype.slice.call(e.target.files || []);
        for (var i = 0; i < fichiers.length && liste.length < 10; i++) {
          try { liste.push({ id: uuid(), blob: await compresser(fichiers[i]), envoyee: false }); } catch (err) { toast(err.message); }
        }
        await Cloud.enregistrerPhotos(f.id, liste);
        e.target.value = '';
        dessiner();
      } });
    async function dessiner() {
      var liste = await Cloud.photos(f.id);
      f.nbPhotos = liste.length;
      saveDraft();
      (grille._urls || []).forEach(function (u) { URL.revokeObjectURL(u); });
      grille._urls = [];
      grille.innerHTML = '';
      liste.forEach(function (p) {
        grille.appendChild(h('div', { class: 'thumb' }, [
          h('img', { src: (function () { var u = URL.createObjectURL(p.blob); grille._urls.push(u); return u; })(), alt: 'Photo jointe' }),
          h('button', { class: 'chip', text: 'Retirer', onclick: async function () {
            await Cloud.enregistrerPhotos(f.id, (await Cloud.photos(f.id)).filter(function (x) { return x.id !== p.id; }));
            dessiner();
          } })
        ]));
      });
    }
    box.appendChild(grille);
    box.appendChild(input);
    box.appendChild(h('button', { class: 'btn btn--ghost btn--block', text: '📷  Prendre / ajouter une photo', onclick: function () { input.click(); } }));
    dessiner();
    return box;
  }

  function validationExtras() {
    var f = S.fiche, cfg = S.config;
    $view.appendChild(h('h2', { text: 'Observations' }));
    $view.appendChild(h('textarea', {
      class: 'textarea', placeholder: 'Anomalies constatées, reprises faites…',
      oninput: function (e) { f.observations = e.target.value; saveDraft(); }
    }, [f.observations || '']));
    $view.appendChild(h('h2', { text: 'Contrôleur' }));
    var opts = uniq((cfg.chefs || []).concat(cfg.chefs_equipe || []).concat(f.compagnons || []));
    $view.appendChild(chipsSelect(opts, function () { return f.controleur; }, false,
      function (o, on) { f.controleur = on ? '' : o; }));
    $view.appendChild(h('h2', { text: 'Signature' }));
    $view.appendChild(signaturePad());
  }

  function signaturePad() {
    var f = S.fiche;
    var wrap = h('div', { class: 'sig' });
    var canvas = h('canvas');
    var hint = h('div', { class: 'sig__hint', text: 'Signez ici avec le doigt' });
    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    var ctx, drawing = false, dirty = false, last = null;
    function setup() {
      var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#27214E';
      if (f.signature) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, r.width, r.height); };
        img.src = f.signature;
        hint.hidden = true;
      }
    }
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener('pointerdown', function (e) {
      drawing = true; last = pos(e); hint.hidden = true; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      var p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true;
    });
    function end() {
      if (!drawing) return;
      drawing = false;
      if (dirty) {
        f.signature = canvas.toDataURL('image/png');
        f.signatureRatio = canvas.width / canvas.height;
        saveDraft();
      }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    var box = h('div', { class: 'stack' }, [wrap, h('button', {
      class: 'btn btn--ghost', text: 'Effacer la signature', onclick: function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        f.signature = null; dirty = false; hint.hidden = false; saveDraft();
      }
    })]);
    requestAnimationFrame(setup);
    return box;
  }

  function badge(statut) {
    var cls = { 'COMPLÈTE': 'ok', 'ANOMALIE': 'ko', 'EN COURS': 'run' }[statut] || 'todo';
    return h('span', { class: 'badge badge--' + cls, text: statut });
  }

  function stepRecap() {
    var f = S.fiche, st = FX.stats(S.contenu, f);
    S.blobPret = { cle: JSON.stringify(f), p: genererBlob(f) };
    S.blobPret.p.catch(function () { S.blobPret = null; });
    $view.appendChild(h('span', { class: 'step-tag', text: 'Récapitulatif' }));
    $view.appendChild(h('h1', { text: 'Vérifier et envoyer' }));
    $view.appendChild(h('div', { class: 'stats' }, [
      h('div', { class: 'stat' }, [h('b', { text: st.ok + '/' + st.total }), h('span', { text: 'contrôles faits' })]),
      h('div', { class: 'stat' }, [h('b', { text: String(st.ko), style: st.ko ? 'color:#B42318' : '' }), h('span', { text: 'anomalies' })]),
      h('div', { class: 'stat' }, [badge(st.statut)])
    ]));
    var restants = st.total - st.ok - st.ko;
    if (restants > 0) $view.appendChild(h('div', { class: 'alert', text: restants + ' point(s) non coché(s). Vous pouvez envoyer quand même ou revenir en arrière.' }));
    var dl = h('dl', { class: 'kv' });
    [['Chantier', f.chantier], ['Bâtiment', f.batiment], ['Niveau', f.niveau], ['Logements', f.logements.join(', ')],
      ['Date', FX.frDate(f.date)], ['Coulage prévu', FX.frDate(f.coulage)], ['Chef chantier', f.chef || '—'],
      ['Chef d\'équipe', f.chef_equipe || '—'], ['Compagnons', f.compagnons.join(', ') || '—'],
      ['Contrôleur', f.controleur || '—'], ['Signature', f.signature ? 'oui' : 'non'],
      ['Photos jointes', String(f.nbPhotos || 0)]].forEach(function (kv) {
      dl.appendChild(h('dt', { text: kv[0] }));
      dl.appendChild(h('dd', { text: kv[1] }));
    });
    $view.appendChild(h('div', { class: 'card' }, [dl]));
    if (st.anomalies.length) {
      $view.appendChild(h('div', { class: 'card' }, [h('strong', { text: 'Anomalies' }),
        h('ul', {}, st.anomalies.map(function (a) { return h('li', { text: a }); }))]));
    }
    var dest = S.settings.mode === 'relais' && S.settings.relaisUrl ? 'Envoi automatique au bureau'
      : (S.settings.email ? 'Destinataire : ' + S.settings.email : 'Destinataire à choisir dans Mail');
    $view.appendChild(h('p', { class: 'muted', text: dest + ' · Objet : ' + FX.objetMail(f) }));
    // liste rouge : chaque point doit être lu et coché avant l'envoi
    var rappels = (S.contenu.rappels || []).slice();
    if (restants > 0) rappels.push(restants + ' point(s) non coché(s) : ils ne s\'appliquent pas ou seront faits avant le coulage.');
    if (st.ko > 0) rappels.push(st.ko + ' anomalie(s) signalée(s) : le chef de chantier est prévenu.');
    var boutonsEnvoi = [];
    var coches = rappels.map(function (t) {
      return h('input', { type: 'checkbox', onchange: majEnvoi });
    });
    var aide = h('p', { class: 'rappels__aide', text: 'Cochez tous les points pour pouvoir envoyer.' });
    $view.appendChild(h('div', { class: 'rappels' }, [
      h('strong', { text: '⚠ Avant d\'envoyer : lisez et cochez chaque point' }),
      h('div', {}, rappels.map(function (t, i) { return h('label', { class: 'rappels__l' }, [coches[i], h('span', { text: t })]); })),
      aide
    ]));
    function majEnvoi() {
      var tous = coches.every(function (c) { return c.checked; });
      boutonsEnvoi.forEach(function (b) { b.disabled = !tous; });
      aide.hidden = tous;
    }
    var btnSend = h('button', { class: 'btn btn--primary btn--block', text: 'Envoyer la fiche', onclick: function () { envoyer(btnSend); } });
    boutonsEnvoi.push(btnSend);
    if (window.Plateforme && window.Plateforme.actif()) {
      // mode connecté : envoi au serveur d'abord, le mail devient le secours
      btnSend.textContent = 'Envoyer par mail (secours)';
      btnSend.className = 'btn btn--ghost btn--block';
      var zoneServeur = window.Plateforme.boutonEnvoiServeur(f);
      boutonsEnvoi.push(zoneServeur.querySelector('button'));
      $view.appendChild(zoneServeur);
    }
    majEnvoi();
    $view.appendChild(h('div', { class: 'stack' }, [
      btnSend,
      h('button', { class: 'btn btn--ghost btn--block', text: 'Télécharger le fichier Excel', onclick: async function () {
        try { telecharger(await genererBlob(f), FX.nomFichier(f)); } catch (e) { erreur(e); }
      } })
    ]));
  }

  // ------------------------------------------------------------ génération / envoi
  async function genererBlob(fiche) {
    var buf = await FX.generer(window.ExcelJS, S.modele.slice(0), S.contenu, fiche);
    return new Blob([buf], { type: XLSX_MIME });
  }
  function telecharger(blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function erreur(e) {
    console.error(e);
    toast('Erreur : ' + (e && e.message ? e.message : e), 5000);
  }

  async function envoyer(btn) {
    var f = S.fiche, st = S.settings;
    btn.disabled = true;
    btn.textContent = 'Préparation…';
    try {
      var blob = await (S.blobPret && S.blobPret.cle === JSON.stringify(f) ? S.blobPret.p : genererBlob(f));
      var name = FX.nomFichier(f), subject = FX.objetMail(f), body = FX.corpsMail(S.contenu, f);
      var mode;
      if (st.mode === 'relais' && st.relaisUrl) {
        var data = await blobToBase64(blob);
        var r = await fetch(st.relaisUrl, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ cle: st.relaisCle, subject: subject, body: body, filename: name, data: data })
        });
        var j = await r.json();
        if (!j.ok) throw new Error(j.error || 'relais indisponible');
        mode = 'relais';
      } else {
        var file = new File([blob], name, { type: XLSX_MIME });
        var fichiers = [file];
        if (window.Cloud) {
          (await Cloud.photos(f.id)).forEach(function (p, i) {
            fichiers.push(new File([p.blob], name.replace(/\.xlsx$/, '') + '_photo' + (i + 1) + '.jpg', { type: 'image/jpeg' }));
          });
        }
        if (navigator.canShare && !navigator.canShare({ files: fichiers })) fichiers = [file];
        if (navigator.canShare && navigator.canShare({ files: fichiers })) {
          try { if (st.email && navigator.clipboard) await navigator.clipboard.writeText(st.email); } catch (e) { /* facultatif */ }
          await navigator.share({ files: fichiers, title: subject,
            text: (st.email ? 'À : ' + st.email + '\n' : '') + 'Objet : ' + subject + '\n\n' + body });
          mode = 'partage';
        } else {
          telecharger(blob, name);
          location.href = 'mailto:' + encodeURIComponent(st.email || '') + '?subject=' + encodeURIComponent(subject) +
            '&body=' + encodeURIComponent(body + '\n\n(Joindre le fichier téléchargé : ' + name + ')');
          mode = 'mail';
        }
      }
      var hist = load(KEYS.history, []);
      hist = hist.filter(function (x) { return !x.fiche || x.fiche.id !== f.id; });
      hist.unshift({ id: f.id, envoye: new Date().toISOString(), mode: mode, statut: FX.stats(S.contenu, f).statut, fiche: f });
      if (!save(KEYS.history, hist.slice(0, 60))) save(KEYS.history, hist.slice(0, 15));
      remove(KEYS.draft);
      apresEnvoi(mode);
    } catch (e) {
      if (e && e.name === 'AbortError') toast('Envoi annulé.');
      else if (e && e.name === 'NotAllowedError') toast('Le téléphone a bloqué le partage : appuyez encore une fois sur le bouton.', 6000);
      else erreur(e);
      btn.disabled = false;
      btn.textContent = 'Envoyer la fiche';
    }
  }

  function apresEnvoi(mode) {
    var f = S.fiche;
    $nav.hidden = true;
    document.getElementById('progress').hidden = true;
    $view.innerHTML = '';
    $view.className = 'view';
    var msg = { relais: 'Fiche envoyée au bureau.', partage: 'Fiche partagée.', mail: 'Fichier téléchargé : joignez-le au mail qui s\'est ouvert.' }[mode];
    $view.appendChild(h('div', { class: 'home-hero' }, [h('img', { src: 'icons/logo.png', alt: '' })]));
    $view.appendChild(h('h1', { text: '✓ ' + msg }));
    $view.appendChild(h('p', { class: 'lead', text: FX.objetMail(f) }));
    $view.appendChild(h('div', { class: 'stack' }, [
      h('button', { class: 'btn btn--primary btn--block', text: '+ Fiche suivante (même niveau)', onclick: function () {
        demarrerFiche(f, 3);
      } }),
      h('button', { class: 'btn btn--ghost btn--block', text: 'Accueil', onclick: home })
    ]));
  }

  // ------------------------------------------------------------ accueil, historique, paramètres
  function home() {
    if (window.Plateforme && window.Plateforme.actif()) { window.Plateforme.home(); return; }
    $nav.hidden = true;
    document.getElementById('progress').hidden = true;
    title('Fiches chantier', 'Euro Sanichauff');
    $view.innerHTML = '';
    $view.className = 'view';
    var draft = load(KEYS.draft, null);
    var hist = load(KEYS.history, []);
    $view.appendChild(h('div', { class: 'home-hero' }, [h('img', { src: 'icons/logo.png', alt: 'Euro Sanichauff' })]));
    $view.appendChild(h('h1', { text: 'Incorporations avant coulage', style: 'text-align:center' }));
    $view.appendChild(h('p', { class: 'lead', style: 'text-align:center', text: 'On contrôle – on photographie – on valide – puis on coule.' }));
    var stack = h('div', { class: 'stack' });
    stack.appendChild(h('button', { class: 'btn btn--primary btn--block', text: '+ Nouvelle fiche', onclick: function () {
      demarrerFiche(null, 0);
    } }));
    if (draft && draft.fiche) {
      stack.appendChild(h('button', { class: 'btn btn--gold btn--block',
        text: 'Reprendre la fiche en cours' + (draft.fiche.chantier ? ' (' + [draft.fiche.batiment, draft.fiche.niveau].filter(Boolean).join(' ') + ')' : ''),
        onclick: function () { S.fiche = draft.fiche; go(draft.step || 0); } }));
    }
    stack.appendChild(h('button', { class: 'btn btn--ghost btn--block', text: 'Fiches envoyées (' + hist.length + ')', onclick: historyView }));
    stack.appendChild(h('button', { class: 'btn btn--ghost btn--block', text: 'Paramètres', onclick: settingsView }));
    $view.appendChild(stack);
    if (!S.settings.email && S.settings.mode !== 'relais') {
      $view.appendChild(h('p', { class: 'muted', style: 'text-align:center;margin-top:16px',
        text: 'Astuce : renseignez l\'adresse de réception dans Paramètres.' }));
    }
    $view.appendChild(h('p', { class: 'muted', style: 'text-align:center;margin-top:24px', text: 'Version ' + VERSION + ' · ' + S.contenu.ref }));
  }

  function historyView() {
    $nav.hidden = true;
    document.getElementById('progress').hidden = true;
    title('Fiches envoyées', 'Historique sur ce téléphone');
    $view.innerHTML = '';
    $view.className = 'view';
    $view.appendChild(h('button', { class: 'btn btn--ghost', text: '← Accueil', onclick: home }));
    var hist = load(KEYS.history, []);
    if (!hist.length) { $view.appendChild(h('p', { class: 'lead', text: 'Aucune fiche envoyée pour l\'instant.' })); return; }
    var list = h('div', { class: 'hist', style: 'margin-top:12px' });
    hist.forEach(function (e) {
      var f = e.fiche;
      list.appendChild(h('div', { class: 'card' }, [
        h('div', {}, [h('strong', { text: f.chantier }), ' ', badge(e.statut)]),
        h('div', { class: 'muted', text: f.batiment + ' · ' + f.niveau + ' · Log. ' + f.logements.join(' ') + ' · ' +
          new Date(e.envoye).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) }),
        h('div', { class: 'hist__actions' }, [
          h('button', { class: 'btn btn--ghost', text: 'Renvoyer', onclick: function () { demarrerFiche(null, STEPS.length - 1, f); } }),
          h('button', { class: 'btn btn--ghost', text: 'Dupliquer', onclick: function () { demarrerFiche(f, 3); } })
        ])
      ]));
    });
    $view.appendChild(list);
  }

  function settingsView() {
    var st = S.settings;
    $nav.hidden = true;
    document.getElementById('progress').hidden = true;
    title('Paramètres', 'Envoi, chantiers, équipes');
    $view.innerHTML = '';
    $view.className = 'view';
    $view.appendChild(h('button', { class: 'btn btn--ghost', text: '← Accueil', onclick: home }));

    function input(lab, key, type, ph) {
      return h('div', { class: 'field' }, [
        h('label', { text: lab, for: 'p_' + key }),
        h('input', { class: 'input', id: 'p_' + key, type: type || 'text', value: st[key] || '', placeholder: ph || '',
          onchange: function (e) { st[key] = e.target.value.trim(); save(KEYS.settings, st); toast('Enregistré'); } })
      ]);
    }
    $view.appendChild(h('h2', { text: 'Envoi des fiches' }));
    $view.appendChild(input('Adresse de réception (facturation)', 'email', 'email', 'facture@…'));
    $view.appendChild(input('Mon nom (pré-sélectionné comme compagnon)', 'monNom', 'text', 'Prénom NOM'));
    var sel = h('select', { class: 'input', id: 'p_mode', onchange: function (e) { st.mode = e.target.value; save(KEYS.settings, st); settingsView(); } }, [
      h('option', { value: 'partage', text: 'Partage du téléphone (Mail, Gmail, Outlook…)' }),
      h('option', { value: 'relais', text: 'Envoi automatique (relais du bureau)' })
    ]);
    sel.value = st.mode;
    $view.appendChild(h('div', { class: 'field' }, [h('label', { text: 'Mode d\'envoi', for: 'p_mode' }), sel]));
    if (st.mode === 'relais') {
      $view.appendChild(input('Adresse du relais (fournie par le bureau)', 'relaisUrl', 'url', 'https://script.google.com/…'));
      $view.appendChild(input('Clé du relais', 'relaisCle', 'text', ''));
    }

    $view.appendChild(h('h2', { text: 'Chantiers et équipes' }));
    var nb = chantiers().length;
    $view.appendChild(h('p', { class: 'muted', text: nb + ' chantier(s) : ' + chantiers().map(function (c) { return c.nom; }).join(', ') }));
    var file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async function (e) {
      var fl = e.target.files[0];
      if (!fl) return;
      try {
        var txt = (await fl.text()).replace(/^﻿/, '');
        var cfg = JSON.parse(txt);
        if (cfg.format !== 'eurosanichauff-config') throw new Error('ce fichier n\'est pas une configuration Euro Sanichauff');
        S.config = fusionConfig(S.config, cfg);
        save(KEYS.config, S.config);
        toast('Configuration importée : ' + (cfg.chantiers || []).map(function (c) { return c.nom; }).join(', '));
        settingsView();
      } catch (err) { erreur(err); }
    } });
    $view.appendChild(file);
    $view.appendChild(h('div', { class: 'stack' }, [
      h('button', { class: 'btn btn--gold btn--block', text: 'Importer une configuration (fichier du classeur)', onclick: function () { file.click(); } }),
      h('button', { class: 'btn btn--ghost btn--block', text: 'Ajouter un chantier à la main', onclick: chantierEditor })
    ]));
    var chantierSel = h('select', { class: 'input' }, chantiers().map(function (c) { return h('option', { value: c.nom, text: c.nom }); }));
    if (nb) {
      $view.appendChild(h('div', { class: 'field', style: 'margin-top:12px' }, [h('label', { text: 'Retirer un chantier' }), chantierSel,
        h('button', { class: 'btn btn--danger', text: 'Retirer ce chantier', onclick: function () {
          if (!confirm('Retirer « ' + chantierSel.value + ' » de ce téléphone ?')) return;
          S.config.chantiers = S.config.chantiers.filter(function (c) { return c.nom !== chantierSel.value; });
          save(KEYS.config, S.config);
          settingsView();
        } })]));
    }
    $view.appendChild(h('h2', { text: 'Installer l\'application' }));
    $view.appendChild(h('p', { class: 'muted', text: 'iPhone : Safari > Partager > « Sur l\'écran d\'accueil ». Android : Chrome > ⋮ > « Installer l\'application ». Elle fonctionne ensuite sans réseau (sauf l\'envoi).' }));
    $view.appendChild(h('p', { class: 'muted', style: 'margin-top:24px', text: 'Version ' + VERSION }));
  }

  function chantierEditor() {
    $nav.hidden = true;
    title('Nouveau chantier', 'Saisie manuelle');
    $view.innerHTML = '';
    $view.className = 'view';
    $view.appendChild(h('button', { class: 'btn btn--ghost', text: '← Paramètres', onclick: settingsView }));
    var nom = h('input', { class: 'input', placeholder: 'Nom du chantier' });
    var adr = h('input', { class: 'input', placeholder: 'Adresse / commune (facultatif)' });
    var struct = h('textarea', { class: 'textarea', placeholder: 'Bât A ; 0 ; 3\nBât A ; 1 ; 4\nBât B ; 0 ; 2' });
    var lists = ['chefs', 'chefs_equipe', 'compagnons'].map(function (k) {
      return h('textarea', { class: 'textarea', placeholder: 'Un nom par ligne', 'data-k': k }, [(S.config[k] || []).join('\n')]);
    });
    $view.appendChild(h('div', { class: 'field', style: 'margin-top:12px' }, [h('label', { text: 'Chantier' }), nom, adr]));
    $view.appendChild(h('div', { class: 'field' }, [h('label', { text: 'Structure : une ligne par niveau « bâtiment ; n° niveau (0 = RDC) ; nombre de logements »' }), struct]));
    ['Chefs de chantier', 'Chefs d\'équipe', 'Compagnons'].forEach(function (lab, i) {
      $view.appendChild(h('div', { class: 'field' }, [h('label', { text: lab }), lists[i]]));
    });
    $view.appendChild(h('button', { class: 'btn btn--primary btn--block', text: 'Enregistrer', onclick: function () {
      if (!nom.value.trim()) { toast('Nom du chantier obligatoire.'); return; }
      var bats = {}, order = [], errs = 0;
      struct.value.split(/\n/).forEach(function (l) {
        if (!l.trim()) return;
        var p = l.split(/[;,\t]/).map(function (x) { return x.trim(); });
        var num = /rdc/i.test(p[1]) ? 0 : parseInt(String(p[1]).replace(/[^\d-]/g, ''), 10);
        var nbl = parseInt(p[2], 10);
        if (!p[0] || isNaN(num) || isNaN(nbl)) { errs++; return; }
        if (!bats[p[0]]) { bats[p[0]] = []; order.push(p[0]); }
        bats[p[0]].push({ num: num, logements: nbl });
      });
      if (!order.length) { toast('Structure vide ou illisible.'); return; }
      var cfg = { chantiers: [{ nom: nom.value.trim(), adresse: adr.value.trim(),
        batiments: order.map(function (b) { return { nom: b, niveaux: bats[b] }; }) }] };
      lists.forEach(function (t) { cfg[t.getAttribute('data-k')] = t.value.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean); });
      S.config = fusionConfig(S.config, cfg);
      ['chefs', 'chefs_equipe', 'compagnons'].forEach(function (k) { S.config[k] = cfg[k]; });
      save(KEYS.config, S.config);
      toast('Chantier enregistré' + (errs ? ' (' + errs + ' ligne(s) ignorée(s))' : ''));
      settingsView();
    } }));
  }

  // ------------------------------------------------------------ démarrage
  async function start() {
    S.settings = Object.assign(defaultSettings(), load(KEYS.settings, {}));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* facultatif */ });
    try {
      var res = await Promise.all([fetch('modele/contenu.json'), fetch('modele/fiche_modele.xlsx')]);
      S.contenu = await res[0].json();
      S.modele = await res[1].arrayBuffer();
    } catch (e) {
      $view.textContent = 'Impossible de charger l\'application. Ouvrez-la une première fois avec du réseau.';
      return;
    }
    buildSteps();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne indisponible */ });
    }
    window.ESApp = {
      S: S, h: h, toast: toast, title: title, go: go, home: home, erreur: erreur, badge: badge,
      nouvelleFiche: nouvelleFiche, demarrerFiche: demarrerFiche, genererBlob: genererBlob, telecharger: telecharger, saveDraft: saveDraft,
      save: save, load: load, KEYS: KEYS, nav: $nav, view: $view, steps: function () { return STEPS; },
      settingsView: settingsView, historyView: historyView
    };
    if (window.Plateforme && window.Plateforme.actif()) { window.Plateforme.demarrer(); return; }
    S.config = load(KEYS.config, null);
    if (!S.config) {
      try { S.config = await (await fetch('config/chantiers.json')).json(); } catch (e) { S.config = { chantiers: [] }; }
    }
    home();
  }
  start();
})();
