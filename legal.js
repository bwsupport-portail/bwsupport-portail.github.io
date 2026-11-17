// Fenêtres d’information légale : ouvertes en un clic depuis le pied de page, ou par un lien direct (#mentions-legales…)
(function () {
  "use strict";
  var IDS = ["mentions-legales", "donnees-personnelles", "reclamations-mediation"];
  var dernierDeclencheur = null;
  function ouvrir(id, declencheur) {
    var d = document.getElementById(id);
    if (!d || typeof d.showModal !== "function") return false;
    IDS.forEach(function (autre) { var x = document.getElementById(autre); if (x && x.open && x !== d) x.close(); });
    if (declencheur) dernierDeclencheur = declencheur;
    if (!d.open) d.showModal();
    d.scrollTop = 0;
    var fermer = d.querySelector("[data-fermer]"); if (fermer) fermer.focus();
    return true;
  }
  document.addEventListener("click", function (e) {
    var lien = e.target.closest && e.target.closest("[data-legal]");
    if (lien && ouvrir(lien.getAttribute("data-legal"), lien)) { e.preventDefault(); return; }
    var btn = e.target.closest && e.target.closest("[data-fermer]");
    if (btn) { var d = btn.closest("dialog"); if (d) d.close(); return; }
    if (e.target.tagName === "DIALOG" && e.target.classList.contains("legal")) {
      var r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
    }
  });
  IDS.forEach(function (id) {
    var d = document.getElementById(id);
    if (d) d.addEventListener("close", function () { if (dernierDeclencheur && document.contains(dernierDeclencheur)) dernierDeclencheur.focus(); });
  });
  function depuisAdresse() { var h = (location.hash || "").slice(1); if (IDS.indexOf(h) !== -1) ouvrir(h, null); }
  window.addEventListener("hashchange", depuisAdresse);
  depuisAdresse();
})();
