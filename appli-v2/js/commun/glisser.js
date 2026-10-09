/*
 * Appli V2 : glisser une ligne vers la gauche pour faire apparaître « Supprimer », « Retirer », « Annuler »…
 * (demande d'Ismael du 09/10). Le bouton n'apparaît que si la personne a le droit ; le toucher ouvre ensuite
 * la même confirmation que les boutons des écrans de détail (qui restent, pour le PC et pour qui ne glisse pas).
 * Une ligne : o.glissable(contenu, [{ a: 'action', v: 'valeur', t: 'Libellé', danger: true }]).
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};
  var SEUIL_DECISION = 8;         // px avant de savoir si le geste est horizontal (glisser) ou vertical (défiler)
  var geste = null, ouverte = null, dernierGlissement = 0;

  function largeurActions(ligne) { var a = ligne.querySelector('.glisse__actions'); return a ? a.offsetWidth : 0; }
  function placer(contenu, x, animer) {
    contenu.style.transition = animer ? 'transform .2s ease' : 'none';
    contenu.style.transform = x ? 'translateX(' + x + 'px)' : '';
  }
  function fermer(ligne) {
    if (!ligne) return;
    var contenu = ligne.querySelector('.glisse__contenu');
    if (contenu) placer(contenu, 0, true);
    ligne.classList.remove('glisse--ouverte');
    if (ouverte === ligne) ouverte = null;
  }

  document.addEventListener('pointerdown', function (ev) {
    var contenu = ev.target.closest && ev.target.closest('.glisse__contenu');
    if (ouverte && !(ev.target.closest && ev.target.closest('.glisse--ouverte'))) fermer(ouverte);   // toucher ailleurs : on referme
    if (!contenu || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    var ligne = contenu.parentNode;
    geste = { ligne: ligne, contenu: contenu, x0: ev.clientX, y0: ev.clientY, depart: ligne === ouverte ? -largeurActions(ligne) : 0, horizontal: null, id: ev.pointerId };
  });
  document.addEventListener('pointermove', function (ev) {
    if (!geste || ev.pointerId !== geste.id) return;
    var dx = ev.clientX - geste.x0, dy = ev.clientY - geste.y0;
    if (geste.horizontal === null) {
      if (Math.abs(dx) < SEUIL_DECISION && Math.abs(dy) < SEUIL_DECISION) return;
      geste.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!geste.horizontal) { geste = null; return; }              // défilement vertical : on laisse faire
      try { geste.contenu.setPointerCapture(ev.pointerId); } catch (e) { /* pas grave */ }
    }
    var max = largeurActions(geste.ligne);
    placer(geste.contenu, Math.max(-max - 20, Math.min(0, geste.depart + dx)), false);
  });
  function finir(ev) {
    if (!geste || ev.pointerId !== geste.id) return;
    var g = geste;
    geste = null;
    if (!g.horizontal) return;
    dernierGlissement = Date.now();
    var max = largeurActions(g.ligne), x = g.depart + (ev.clientX - g.x0);
    if (x < -max / 2) {
      if (ouverte && ouverte !== g.ligne) fermer(ouverte);
      placer(g.contenu, -max, true);
      g.ligne.classList.add('glisse--ouverte');
      ouverte = g.ligne;
      var bouton = g.ligne.querySelector('.glisse__actions button');
      if (bouton) bouton.tabIndex = 0;
    } else fermer(g.ligne);
  }
  document.addEventListener('pointerup', finir);
  document.addEventListener('pointercancel', function (ev) { if (geste && ev.pointerId === geste.id) { fermer(geste.ligne); geste = null; } });
  // juste après un glissement, le « clic » de fin de geste n'ouvre pas la ligne
  document.addEventListener('click', function (ev) {
    if (Date.now() - dernierGlissement < 350 && ev.target.closest && ev.target.closest('.glisse__contenu')) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  }, true);

  function glissable(contenu, actions, classe) {
    actions = (actions || []).filter(Boolean);
    if (!actions.length) return contenu;
    var h = ES.outils.h;
    return '<div class="glisse' + (classe ? ' ' + classe : '') + '"><div class="glisse__actions">' + actions.map(function (x) {
      return '<button class="glisse__btn' + (x.danger ? ' glisse__btn--danger' : '') + '" data-a="' + x.a + '" data-v="' + h(x.v) + '" tabindex="-1">' + h(x.t) + '</button>';
    }).join('') + '</div><div class="glisse__contenu">' + contenu + '</div></div>';
  }

  ES.outils.glissable = glissable;
})(window);
