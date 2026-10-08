/*
 * Appli V2 : signature au doigt (étape 8). Le tracé est gardé en image PNG dans le brouillon.
 */
(function (root) {
  'use strict';
  var ES = root.ES = root.ES || {};

  // branche la zone de signature ; quandSigne(imagePng, ratio) est appelé à la fin de chaque trait
  function brancher(toile, imageExistante, quandSigne) {
    var cadre = toile.getBoundingClientRect();
    toile.width = cadre.width;               // taille réelle à l'écran : image légère pour le serveur
    toile.height = cadre.height;
    var g = toile.getContext('2d');
    g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#27214E';
    if (imageExistante) {
      var img = new Image();
      img.onload = function () { g.drawImage(img, 0, 0, toile.width, toile.height); };
      img.src = imageExistante;
    }
    var trace = false, bouge = false;
    function point(e) { var b = toile.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    toile.addEventListener('pointerdown', function (e) {
      trace = true; bouge = false;
      toile.setPointerCapture(e.pointerId);
      var p = point(e); g.beginPath(); g.moveTo(p[0], p[1]);
      var aide = toile.parentElement.querySelector('.sign__ph');
      if (aide) aide.remove();
    });
    toile.addEventListener('pointermove', function (e) {
      if (!trace) return;
      var p = point(e); g.lineTo(p[0], p[1]); g.stroke(); bouge = true;
    });
    function fin() {
      if (!trace) return;
      trace = false;
      if (bouge) quandSigne(toile.toDataURL('image/png'), toile.width / toile.height);
    }
    toile.addEventListener('pointerup', fin);
    toile.addEventListener('pointercancel', fin);
  }

  ES.signature = { brancher: brancher };
})(window);
