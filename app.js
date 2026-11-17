/* ============================================================
   Portail BeWeal – géré par BW Support (version 3).
   Page autonome : elle n’appelle que le service Google Apps Script de
   BW Support (adresse ci-dessous), qui contrôle chaque accès et chaque dépôt.
   Lien direct parcours garage : …/?qui=garage – parcours client : …/?qui=client
   Aucune donnée personnelle ne passe par l’adresse de la page.
   ============================================================ */
const API_PORTAIL = "https://script.google.com/macros/s/AKfycbwB6vLsHsnYD8lpD-1Ah_Pm68fJ4kbORwKmU2AWwcRQ4DiTtwO75_0fRTKwVVZ5eXwtRg/exec";
const CONFIG = { maxFileMb: 10, maxImageMb: 25 };

(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ENLIGNE = true;
  // Appel anonyme du service (sans cookies ni adresse d’origine) : fonctionne quel que soit le nombre de comptes Google connectés.
  let serveur = async (fn, ...args) => {
    let r;
    try {
      r = await fetch(API_PORTAIL, { method: "POST", credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ fn, args }) });
    } catch (err) { throw new Error("Connexion impossible. Vérifiez votre accès à Internet."); }
    let j = null;
    try { j = await r.json(); } catch (err) { }
    if (!j) throw new Error("Réponse inattendue du service. Réessayez dans un instant.");
    if (!j.ok) throw new Error(j.erreur || "Erreur inconnue.");
    return j.resultat;
  };
  // Le portail ne s’affiche pas dans le cadre d’un autre site (protection que GitHub Pages ne permet pas par en-tête HTTP).
  if (ENLIGNE && window.top !== window.self) {
    const lien = document.createElement("a"); lien.href = location.href; lien.target = "_top"; lien.rel = "noopener";
    lien.textContent = "Ouvrir le portail BeWeal dans une nouvelle page";
    document.body.replaceChildren(lien);
    return;
  }
  const enBase64 = f => new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => ko(new Error(`Lecture impossible du fichier « ${f.name} ».`));
    r.readAsDataURL(f);
  });
  const form = $("#claimForm");

  /* ---------- Données de référence ---------- */
  const PANNE_REQ = ["date_panne", "km", "conditions", "symptomes", "voyants", "roulage_apres", "vehicule_roulant", "remorque", "description"];
  const SECTIONS = [
    { key: "garage", step: "step-garage", icon: "i-garage",
      name: { garage: "Votre garage", client: "Garage" }, miss: { garage: "votre garage", client: "le garage" },
      req: { garage: ["garage_nom", "garage_ville", "siret", "naf", "garage_contact", "garage_tel", "garage_email", "date_depot", "travaux"],
             client: ["garage_nom", "garage_ville"] } },
    { key: "client", step: "step-client", icon: "i-user",
      name: { garage: "Client", client: "Coordonnées" }, miss: { garage: "le client", client: "vos coordonnées" },
      req: { garage: ["nom", "prenom", "email"], client: ["nom", "prenom", "email", "telephone"] } },
    { key: "vehicule", step: "step-vehicule", icon: "i-car", name: "Véhicule", miss: "le véhicule",
      req: { garage: ["immat", "marque", "modele"], client: ["immat", "marque", "modele"] } },
    { key: "panne", step: "step-panne", icon: "i-engine", name: "Panne", miss: "la panne",
      req: { garage: PANNE_REQ, client: PANNE_REQ } }
  ];

  const DOCS = [
    { key: "diagnostic", req: true, bloquant: true, icon: "i-pulse", short: "Diagnostic", miss: "le diagnostic",
      title: "Diagnostic du garage", desc: "Le compte rendu du garage qui identifie l’origine de la panne et la pièce en cause.",
      missing: "Ajoutez le diagnostic du garage.",
      exemple: ["Compte rendu daté, avec l’immatriculation ou le numéro de série (VIN)", "Codes défaut relevés à la valise et leur libellé", "Pièce en cause et origine de la panne", "Nom, tampon ou signature du garage"] },
    { key: "devis", req: true, bloquant: true, icon: "i-quote", short: "Devis", miss: "le devis",
      rappel: "Devis contrôlé à partir des données constructeur ; main-d’œuvre retenue selon le barème du constructeur.",
      title: "Devis de réparation", desc: "Le devis détaillé des réparations, pièces et main-d’œuvre, établi par le garage.",
      missing: "Ajoutez le devis de réparation.",
      exemple: ["Détail des pièces avec leurs références et prix", "Main-d’œuvre : nombre d’heures et taux horaire", "Montants HT, TVA et TTC", "Immatriculation, kilométrage et coordonnées du garage"] },
    { key: "carte_grise", req: true, bloquant: true, icon: "i-card", short: "Carte grise", miss: "la carte grise",
      title: "Carte grise", desc: "Le certificat d’immatriculation du véhicule, entièrement lisible.",
      missing: "Ajoutez la carte grise du véhicule.",
      exemple: ["Le document entier, les quatre coins visibles", "Net, sans reflet ni doigt sur le texte", "Nom du titulaire et date de première immatriculation lisibles", "Véhicule récemment acheté : le certificat provisoire convient"] },
    { key: "suivi_entretien", req: true, bloquant: true, icon: "i-book", short: "Carnet d’entretien", miss: "le suivi d’entretien",
      title: "Suivi d’entretien", desc: "Le carnet d’entretien tamponné ou les factures des révisions réalisées.",
      missing: "Ajoutez le carnet ou les factures d’entretien.",
      exemple: ["Toutes les révisions depuis l’achat du véhicule", "Pour chaque révision : date et kilométrage lisibles", "Factures détaillées (vidange, filtres…) ou pages tamponnées du carnet", "Plusieurs photos ou un PDF regroupé, au choix"] },
    { key: "controle_technique", reqRoles: ["garage", "client"], bloquant: true, icon: "i-check", short: "Contrôle technique", miss: "le dernier contrôle technique",
      title: "Dernier contrôle technique", desc: "Le procès-verbal du dernier contrôle technique réalisé sur le véhicule.",
      missing: "Ajoutez le procès-verbal du dernier contrôle technique.",
      exemple: ["Le procès-verbal complet, toutes les pages", "Date du contrôle et kilométrage lisibles", "Résultat : favorable, contre-visite ou défavorable", "Véhicule de moins de 4 ans, sans contrôle encore : joignez la carte grise à la place"] },
    { key: "cession", reqRoles: ["client"], only: "client", icon: "i-quote", short: "Cession", miss: "la déclaration de cession",
      title: "Déclaration de cession", desc: "Le certificat de cession (Cerfa n° 15776) remis lors de l’achat du véhicule.",
      missing: "Ajoutez la déclaration de cession du véhicule.",
      exemple: ["Cerfa n° 15776 complet, signé par le vendeur et par l’acheteur", "Date et heure de la vente lisibles", "Kilométrage au jour de la vente", "Vendeur professionnel : son tampon ou sa raison sociale"] },
    { key: "rib", reqRoles: ["garage"], bloquant: true, only: "garage", icon: "i-card", short: "RIB", miss: "le RIB du garage",
      title: "RIB du garage", desc: "Une photo ou un PDF du relevé d’identité bancaire du garage, au nom de l’entreprise. Il n’est jamais réaffiché sur le portail. Il sert exclusivement au règlement des réparations prises en charge.",
      missing: "Ajoutez le RIB du garage (une photo suffit)." },
    { key: "compteur", req: true, bloquant: true, icon: "i-gauge", short: "Compteur", miss: "la photo du compteur",
      title: "Photo du compteur", desc: "Le tableau de bord, contact mis, avec le kilométrage lisible.",
      missing: "Ajoutez une photo du compteur kilométrique.",
      exemple: ["Contact mis, tableau de bord allumé", "Kilométrage entièrement lisible, sans reflet", "Voyants allumés visibles s’il y en a", "Photo prise au téléphone : elle est allégée automatiquement"] },
    { key: "jdd", icon: "i-pulse",
      title: "Historique des défauts (JDD)", desc: "Si nécessaire : le journal des défauts relevé à la valise de diagnostic, avec les codes et leur date d’apparition." },
    { key: "photos", req: false, icon: "i-camera",
      title: "Photos de la panne", desc: "Voyants allumés, pièce endommagée, fuite, compartiment moteur." },
    { key: "autres", req: false, icon: "i-file",
      title: "Autres documents", desc: "Factures de réparations antérieures, rapport d’expertise, tout document utile." }
  ];
  /* Pièce visible et obligatoire selon la partie remplie (garage ou client). */
  const partie = () => role || "garage";
  const visible = d => !d.only || d.only === partie();
  const sections = () => SECTIONS.filter(s => !s.only || s.only === partie());
  DOCS.forEach(d => {
    if (!d.reqRoles) d.reqRoles = d.req ? ["garage", "client"] : [];
    delete d.req;
    Object.defineProperty(d, "req", { get() { return visible(d) && d.reqRoles.includes(partie()); } });
  });

  /* Pièces sans lesquelles l’envoi est refusé (jointes maintenant ou déjà reçues au dossier). */
  // Sans consultation (référence absente ou non reconnue), l’état du dossier est inconnu.
  //   false : aucune pièce ne bloque le dépôt (décision D1 : la référence ne bloque jamais un dépôt) – réglage retenu ;
  //   true  : chaque envoi doit contenir lui-même toutes les pièces obligatoires de la partie (complétude stricte).
  const BLOCAGE_SANS_CONSULTATION = false;
  const piecesExigees = () => consultation || BLOCAGE_SANS_CONSULTATION;
  const piecesBloquantesManquantes = () => piecesExigees() ? DOCS.filter(d => d.bloquant && visible(d) && !files[d.key].length && !recuesDossier.has(d.key)) : [];

  const MSG = {
    qui: "Indiquez qui remplit ce dossier.",
    garage_nom: "Indiquez le nom du garage.", garage_ville: "Indiquez la ville ou le code postal du garage.",
    garage_contact: "Indiquez le nom du conseiller.", garage_tel: "Indiquez un numéro de téléphone à 10 chiffres.",
    garage_email: "Indiquez une adresse email valide, par exemple atelier@garage.fr.", travaux: "Choisissez une réponse.",
    nom: "Indiquez le nom.", prenom: "Indiquez le prénom.",
    email: "Indiquez une adresse email valide, par exemple nom@exemple.fr.", telephone: "Indiquez un numéro de téléphone à 10 chiffres.",
    siret: "Indiquez un SIRET valide de 14 chiffres.", naf: "Indiquez un code NAF au format 45.20A.",
    immat: "Indiquez l’immatriculation au format AB-123-CD.", marque: "Indiquez la marque.", modele: "Indiquez le modèle.",
    energie: "Choisissez l’énergie du véhicule.", mise_circulation: "Indiquez une date qui n’est pas dans le futur.",
    date_achat: "Indiquez la date d’achat (elle ne peut pas être dans le futur).", km_achat: "Indiquez un kilométrage en chiffres.",
    date_panne: "Indiquez la date de la panne (elle ne peut pas être dans le futur).", km: "Indiquez le kilométrage au moment de la panne.",
    roulage_apres: "Choisissez une réponse.", vehicule_roulant: "Choisissez une réponse.", remorque: "Choisissez une réponse.",
    conditions: "Choisissez au moins une réponse.", symptomes: "Choisissez au moins une réponse.", voyants: "Choisissez au moins une réponse.",
    description: "Décrivez la panne en 20 caractères minimum.",
    date_depot: "Indiquez la date d’entrée du véhicule à l’atelier (elle ne peut pas être dans le futur).", montant_devis: "Indiquez un montant en euros.",
    certification: "Cochez la case pour confirmer l’exactitude des informations.",
    ref: "La référence du contrat est obligatoire : PO-PM- suivi de six chiffres.",
    refDevis: "Cette référence est celle d’un devis (QU-PM-…). Saisissez celle du contrat, qui commence par PO-PM-."
  };

  /* ---------- Outils ---------- */
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const toInt = v => { const s = String(v || "").replace(/\D/g, ""); return s ? parseInt(s, 10) : null; };
  const toNum = v => { const s = String(v || "").replace(/[\s\u202f\u00a0]/g, "").replace(",", "."); const n = parseFloat(s); return isNaN(n) ? null : n; };
  const fmtN = n => n.toLocaleString("fr-FR");
  const fmtDate = iso => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const fmtKm = v => { const n = toInt(v); return n === null ? "" : `${fmtN(n)} km`; };
  const fmtEur = v => { const n = toNum(v); return n === null ? "" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }); };
  const fmtSize = b => b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} Ko` : `${(b / 1048576).toFixed(1).replace(".", ",")} Mo`;
  const diffDays = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
  const duration = days => {
    if (days < 61) return `${days} jour${days > 1 ? "s" : ""}`;
    const months = Math.floor(days / 30.44);
    if (months < 24) return `environ ${months} mois`;
    const y = Math.floor(months / 12), m = months % 12;
    return `environ ${y} ans${m ? ` et ${m} mois` : ""}`;
  };
  const joinFr = arr => arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} et ${arr[arr.length - 1]}`;

  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= todayISO() && v >= "1950-01-01";
  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  const isTel = v => { const d = v.replace(/\D/g, ""); return d.length >= 10 && d.length <= 15; };
  const isImmat = v => /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(v) || /^\d{1,4} ?[A-Z]{1,3} ?(\d{2,3}|2A|2B)$/.test(v);
  const isSiret = v => {
    const d = v.replace(/\s/g, "");
    if (!/^\d{14}$/.test(d)) return false;
    let s = 0;
    for (let i = 0; i < 14; i++) { let n = +d[13 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; }
    return s % 10 === 0 || d.startsWith("356000000");
  };
  const min2 = v => v.trim().length >= 2;
  const filled = v => v.trim().length > 0;

  const V = {
    garage_nom: min2, garage_ville: min2, garage_contact: min2, garage_tel: isTel, garage_email: isEmail, travaux: filled,
    date_depot: isDate, montant_devis: v => { const n = toNum(v); return n !== null && n > 0; },
    nom: min2, prenom: min2, email: isEmail, telephone: isTel,
    siret: isSiret, naf: v => /^\d{2}\.?\d{2}[A-Z]$/i.test(v.trim()),
    immat: isImmat, marque: min2, modele: filled,
    date_panne: isDate, km: v => (toInt(v) || 0) > 0, roulage_apres: filled, description: v => v.trim().length >= 20,
    vehicule_roulant: filled, remorque: filled, conditions: filled, symptomes: filled, voyants: filled
  };

  const val = name => {
    const el = form.elements[name];
    if (!el) return "";
    if (el instanceof RadioNodeList) { const c = form.querySelector(`input[name="${name}"]:checked`); return c ? c.value : ""; }
    return el.value || "";
  };
  const checked = name => $$(`input[name="${name}"]:checked`, form).map(i => i.value);

  /* ---------- État ---------- */
  let role = null;
  let reqSet = new Set();
  const touched = new Set();
  const files = {};
  DOCS.forEach(d => { files[d.key] = []; });
  let igniting = false;
  let plaqueDossier = "";
  let consultation = false;   // vrai quand le serveur a reconnu la plaque et la référence du contrat
  let jetonSession = "";      // jeton remis par le serveur, gardé en mémoire uniquement
  let champsDossier = {};
  const CHAMPS_PARTAGES = ["garage_nom", "garage_ville", "siret", "naf", "garage_contact", "garage_tel", "garage_email", "date_depot", "montant_devis", "travaux",
    "marque", "modele", "date_panne", "km", "conditions", "symptomes", "voyants", "roulage_apres", "vehicule_roulant", "remorque", "description"];
  let recuesDossier = new Set();
  let lastState = {};
  const roleOf = () => role || "garage";
  const pick = x => (typeof x === "string" ? x : x[roleOf()]);

  /* ---------- Jauge ---------- */
  const G = { cx: 120, cy: 118, r: 92, start: 150, sweep: 240 };
  const ARC_LEN = G.r * G.sweep * Math.PI / 180;
  const pt = (r, deg) => { const a = deg * Math.PI / 180; return [G.cx + r * Math.cos(a), G.cy + r * Math.sin(a)]; };
  const arc = (r, d0, d1) => { const [x0, y0] = pt(r, d0), [x1, y1] = pt(r, d1); const large = d1 - d0 > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  (function buildGauge() {
    const ns = "http://www.w3.org/2000/svg";
    $("#gTrack").setAttribute("d", arc(G.r, G.start, G.start + G.sweep));
    $("#gValue").setAttribute("d", arc(G.r, G.start, G.start + G.sweep));
    $("#gZone").setAttribute("d", arc(G.r - 10, G.start + G.sweep * 0.8, G.start + G.sweep));
    const v = $("#gValue"); v.style.strokeDasharray = `${ARC_LEN} ${ARC_LEN}`; v.style.strokeDashoffset = ARC_LEN; v.style.opacity = 0;
    const g = $("#gTicks");
    for (let i = 0; i <= 20; i++) {
      const deg = G.start + i * (G.sweep / 20), major = i % 2 === 0;
      const [x1, y1] = pt(G.r + 7, deg), [x2, y2] = pt(G.r + (major ? 15 : 11), deg);
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", x1.toFixed(2)); l.setAttribute("y1", y1.toFixed(2)); l.setAttribute("x2", x2.toFixed(2)); l.setAttribute("y2", y2.toFixed(2));
      l.setAttribute("class", major ? "g-tick major" : "g-tick"); g.appendChild(l);
      if (i % 4 === 0) {
        const [tx, ty] = pt(G.r - 22, deg);
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", tx.toFixed(2)); t.setAttribute("y", ty.toFixed(2)); t.setAttribute("class", "g-label");
        t.textContent = String(i * 5); g.appendChild(t);
      }
    }
  })();
  function setGauge(p, showReadout = true) {
    p = Math.max(0, Math.min(1, p));
    $("#gNeedle").style.transform = `rotate(${G.start + p * G.sweep}deg)`;
    const v = $("#gValue"); v.style.strokeDashoffset = ARC_LEN * (1 - p); v.style.opacity = p > 0.004 ? 1 : 0;
    v.classList.toggle("full", p >= 0.999);
    if (showReadout) {
      const pct = Math.round(p * 100);
      $("#gNum").textContent = pct; $("#miniPct").textContent = `${pct} %`;
      const bar = $("#miniBar"); bar.style.width = `${pct}%`; bar.classList.toggle("full", pct === 100);
    }
  }

  /* ---------- Voyants ---------- */
  function orderedSections() {
    return sections().sort((a, b) => {
      const ea = document.getElementById(a.step), eb = document.getElementById(b.step);
      return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }
  function lightHTML(key, name, icon, target) {
    return `<li><button type="button" class="light is-on" data-key="${key}" data-target="${target}">
      <span class="light-icon"><svg class="ic"><use href="#${icon}"/></svg><span class="light-alerte" aria-hidden="true"><svg class="ic"><use href="#i-alerte"/></svg></span></span>
      <span class="light-text"><span class="light-name">${name}</span><span class="light-state"></span></span></button></li>`;
  }
  function buildLights() {
    $("#lightsInfo").innerHTML = orderedSections().map(s => lightHTML(s.key, pick(s.name), s.icon, s.step)).join("");
    $("#lightsDocs").innerHTML = DOCS.filter(d => d.req).map(d => lightHTML(d.key, d.short, d.icon, `row-${d.key}`)).join("");
    ["#lightsInfo", "#lightsDocs"].forEach(id => { const ul = $(id); ul.parentNode.style.setProperty("--nb", ul.children.length || 1); });
    setLights(lastState);
  }
  function setLights(st, forceOn = false) {
    $$(".light").forEach(b => {
      const key = b.dataset.key, ok = !forceOn && !!st[key];
      const isDoc = DOCS.some(d => d.key === key);
      b.classList.toggle("is-on", !ok); b.classList.toggle("is-ok", ok);
      const state = ok ? (isDoc ? "Fourni" : "Complet") : (isDoc ? "À fournir" : "À compléter");
      b.querySelector(".light-state").textContent = state;
      b.setAttribute("aria-label", `${b.querySelector(".light-name").textContent} : ${state}`);
    });
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".light"); if (!b) return;
    if (!role) { $(plaqueDossier ? "#who" : "#acces").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); return; }
    const t = document.getElementById(b.dataset.target); if (!t) return;
    t.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    const f = t.querySelector("input:not([type=hidden]),select,textarea"); if (f) setTimeout(() => f.focus({ preventScroll: true }), reduceMotion ? 0 : 450);
  });

  /* ---------- Pièces justificatives ---------- */
  const ACCEPT_EXT = /\.(pdf|jpe?g|png|heic|heif)$/i;
  const SVG_EXEMPLE = {
    diagnostic: `<rect class="ex-papier" x="30" y="4" width="140" height="122" rx="4"/><rect class="ex-ligne" x="42" y="16" width="56" height="7" rx="2"/><rect class="ex-ligne" x="42" y="28" width="90" height="4" rx="2"/>
      <rect class="ex-plein" x="40" y="40" width="120" height="30" rx="3"/><rect class="ex-zone" x="40" y="40" width="120" height="30" rx="3"/><text class="ex-txt" x="48" y="58">Codes défaut</text>
      <rect class="ex-ligne" x="42" y="78" width="110" height="4" rx="2"/><rect class="ex-ligne" x="42" y="86" width="96" height="4" rx="2"/><text class="ex-txt" x="42" y="104">Pièce en cause</text>
      <circle class="ex-zone" cx="146" cy="108" r="12"/>`,
    devis: `<rect class="ex-papier" x="30" y="4" width="140" height="122" rx="4"/><rect class="ex-ligne" x="42" y="14" width="60" height="7" rx="2"/>
      <rect class="ex-plein" x="40" y="28" width="120" height="44" rx="3"/><rect class="ex-zone" x="40" y="28" width="120" height="44" rx="3"/><text class="ex-txt" x="48" y="44">Pièces + références</text><text class="ex-txt" x="48" y="62">Main-d’œuvre</text>
      <rect class="ex-ligne" x="42" y="80" width="110" height="4" rx="2"/><rect class="ex-ligne" x="42" y="88" width="80" height="4" rx="2"/>
      <rect class="ex-plein" x="100" y="98" width="60" height="20" rx="3"/><rect class="ex-zone" x="100" y="98" width="60" height="20" rx="3"/><text class="ex-txt" x="108" y="111">Total TTC</text>`,
    carte_grise: `<rect class="ex-papier" x="18" y="20" width="164" height="94" rx="6"/><rect class="ex-ligne" x="30" y="32" width="70" height="6" rx="2"/>
      <rect class="ex-ligne" x="30" y="46" width="120" height="4" rx="2"/><rect class="ex-ligne" x="30" y="54" width="100" height="4" rx="2"/><rect class="ex-ligne" x="30" y="62" width="112" height="4" rx="2"/>
      <rect class="ex-plein" x="28" y="74" width="144" height="28" rx="3"/><rect class="ex-zone" x="28" y="74" width="144" height="28" rx="3"/><text class="ex-txt" x="36" y="91">Titulaire · 1re immatriculation</text>
      <path class="ex-coin" d="M12 30V14h16M172 14h16v16M188 104v16h-16M28 120H12v-16"/>`,
    suivi_entretien: `<rect class="ex-papier" x="20" y="14" width="110" height="104" rx="4"/><rect class="ex-papier" x="70" y="6" width="110" height="104" rx="4"/>
      <rect class="ex-ligne" x="82" y="18" width="50" height="6" rx="2"/><rect class="ex-plein" x="80" y="32" width="90" height="22" rx="3"/><rect class="ex-zone" x="80" y="32" width="90" height="22" rx="3"/><text class="ex-txt" x="88" y="46">Date · kilométrage</text>
      <rect class="ex-ligne" x="82" y="62" width="86" height="4" rx="2"/><rect class="ex-ligne" x="82" y="70" width="70" height="4" rx="2"/><rect class="ex-ligne" x="82" y="78" width="80" height="4" rx="2"/>
      <text class="ex-txt" x="82" y="98">Vidange, filtres…</text>`
  };
  function exempleHTML(d) {
    if (!d.exemple) return "";
    return `<details class="exemple"><summary>Ce qui est attendu</summary><div class="exemple-corps">
      <svg viewBox="0 0 200 130" role="img" aria-label="Exemple schématique : ${d.title}">${SVG_EXEMPLE[d.key] || ""}</svg>
      <ul>${d.exemple.map(x => `<li>${x}</li>`).join("")}</ul></div></details>${d.rappel ? `<p class="ex-rappel">${d.rappel}</p>` : ""}`;
  }
  function docRowHTML(d) {
    return `<div class="doc-row" id="row-${d.key}">
      <div class="doc-info">
        <span class="doc-icon"><svg class="ic"><use href="#${d.icon}"/></svg></span>
        <div><h4 class="doc-title">${d.title}</h4><p class="doc-desc">${d.desc}</p>${exempleHTML(d)}
        <span class="pill${d.req ? "" : " pill-opt"}" id="pill-${d.key}">${d.req ? "Obligatoire" : "Facultatif"}</span></div>
      </div>
      <div class="doc-upload">
        <label class="drop" id="drop-${d.key}">
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/${"*"}" data-doc="${d.key}" aria-label="${d.title} : ajouter des fichiers" aria-describedby="err-${d.key}">
          <svg class="ic"><use href="#i-upload"/></svg>
          <span class="drop-main drop-first"><span class="t-desk">Choisissez un fichier <u>ou déposez-le ici</u></span><span class="t-touch">Prendre une photo <u>ou choisir un fichier</u></span></span>
          <span class="drop-main drop-more">Ajouter un autre fichier</span>
          <small>PDF, JPG, PNG ou HEIC · photos allégées automatiquement</small>
        </label>
        <ul class="files" id="files-${d.key}"></ul>
        <p class="error" id="err-${d.key}" aria-live="polite"></p>
      </div>
    </div>`;
  }
  $("#docsOptional").innerHTML = DOCS.map(docRowHTML).join("");
  /* Range chaque pièce selon la partie remplie : obligatoire, facultative ou propre au garage. */
  function placerPieces() {
    DOCS.forEach(d => {
      const row = $(`#row-${d.key}`); if (!row) return;
      const vis = visible(d);
      if (!vis && files[d.key].length) files[d.key] = [];
      row.hidden = !vis;
      if (!vis) { row.classList.remove("invalid"); const e = $(`#err-${d.key}`); if (e) e.textContent = ""; }
      (d.only === "garage" ? $("#docsGarage") : d.req ? $("#docsRequired") : $("#docsOptional")).appendChild(row);
      renderFiles(d.key);
    });
  }
  placerPieces();

  function addFiles(key, list) {
    const errs = [];
    Array.from(list).forEach(f => {
      if (!ACCEPT_EXT.test(f.name) && !/^image\//.test(f.type) && f.type !== "application/pdf") { errs.push(`« ${f.name} » n’est pas dans un format accepté (PDF, JPG, PNG ou HEIC).`); return; }
      const estImage = /^image\//i.test(f.type) && !/^image\/(heic|heif)$/i.test(f.type);
      const max = estImage ? CONFIG.maxImageMb : CONFIG.maxFileMb;
      if (f.size > max * 1048576) { errs.push(`« ${f.name} » dépasse ${max} Mo.`); return; }
      if (!files[key].some(x => x.name === f.name && x.size === f.size)) files[key].push(f);
    });
    renderFiles(key);
    const err = $(`#err-${key}`);
    err.textContent = errs.join(" ");
    if (files[key].length) $(`#row-${key}`).classList.remove("invalid");
    update();
  }
  function renderFiles(key) {
    const ul = $(`#files-${key}`); ul.innerHTML = "";
    files[key].forEach((f, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<svg class="ic"><use href="#i-check"/></svg><span class="fname"></span><span class="fsize"></span>
        <button type="button" class="fremove"><svg class="ic"><use href="#i-x"/></svg></button>`;
      li.querySelector(".fname").textContent = f.name;
      li.querySelector(".fname").title = f.name;
      li.querySelector(".fsize").textContent = fmtSize(f.size);
      const btn = li.querySelector(".fremove");
      btn.setAttribute("aria-label", `Retirer ${f.name}`);
      btn.addEventListener("click", () => { files[key].splice(i, 1); renderFiles(key); update(); $(`#drop-${key} input`).focus(); });
      ul.appendChild(li);
    });
    const d = DOCS.find(x => x.key === key), pill = $(`#pill-${key}`), n = files[key].length;
    $(`#row-${key}`).classList.toggle("has-files", n > 0);
    if (n) { pill.className = "pill ok"; pill.innerHTML = `<svg class="ic"><use href="#i-check"/></svg>${n} fichier${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""}`; }
    else if (recuesDossier.has(key)) { pill.className = "pill ok"; pill.innerHTML = `<svg class="ic"><use href="#i-check"/></svg>Déjà au dossier`; }
    else { pill.className = `pill${d.req ? "" : " pill-opt"}`; pill.textContent = d.req ? "Obligatoire" : "Facultatif"; }
  }
  $$(".drop input[type=file]").forEach(inp => {
    inp.addEventListener("change", () => { addFiles(inp.dataset.doc, inp.files); inp.value = ""; });
    const zone = inp.closest(".drop");
    ["dragenter", "dragover"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("drag"); }));
    zone.addEventListener("drop", e => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(inp.dataset.doc, e.dataTransfer.files); });
  });
  ["dragover", "drop"].forEach(ev => window.addEventListener(ev, e => { if (!e.target.closest || !e.target.closest(".drop")) e.preventDefault(); }));

  /* ---------- Rôle (garage ou client) ---------- */
  const TEXTE_CERTIF_CLIENT = "Je certifie que les informations fournies sont exactes et que les documents joints sont authentiques.";
  const TEXTE_CERTIF_PRO = "Je certifie que les informations fournies sont exactes et que les documents joints sont authentiques. J’ai pris connaissance des modalités d’analyse du devis et des règles de prise en charge.";
  const MSG_PARTIE = {
    client: "Des informations exactes et des photos nettes : c’est tout ce qu’il nous faut pour étudier votre demande sans vous relancer.",
    garage: "Un diagnostic précis et un devis détaillé (références des pièces, temps de main-d’œuvre, taux horaire) : c’est ce qui permet une analyse rapide, sans demande de complément."
  };
  function setRole(r) {
    role = r;
    $("#msgPartie").textContent = MSG_PARTIE[r] || ""; $("#msgPartie").hidden = !MSG_PARTIE[r];
    $("#noteDevis").hidden = r !== "garage";
    $("#texteCertification").textContent = r === "garage" ? TEXTE_CERTIF_PRO : TEXTE_CERTIF_CLIENT;
    const g = $("#step-garage"), c = $("#step-client");
    if (r === "client") g.parentNode.insertBefore(c, g); else c.parentNode.insertBefore(g, c);
    g.hidden = false;   /* partie client : le garage aussi (nom, ville, conseiller, téléphone, e-mail, date d’entrée) */
    $$("[data-seulement]").forEach(el => {
      const actif = el.dataset.seulement === r;
      el.hidden = !actif;
      $$("input, select, textarea", el).forEach(i => { i.disabled = !actif; });
    });
    $$(".step").filter(s => !s.hidden).forEach((s, i) => { const n = s.querySelector(".step-num"); if (n) n.textContent = i + 1; });
    $$("[data-garage][data-client]").forEach(el => { el.textContent = el.dataset[r]; });
    reqSet = new Set(sections().flatMap(s => s.req[r]));
    $$(".field[data-field]").forEach(f => {
      const n = f.dataset.field;
      if (n === "certification") return;
      const optional = !reqSet.has(n);
      f.classList.toggle("is-opt", optional);
      if (optional && !val(n)) clearError(n);
    });
    $("#who").classList.remove("invalid"); $("#err-qui").textContent = "";
    $("#ribBloc").hidden = r !== "garage";
    placerPieces();
    const dossierOuvert = !!plaqueDossier && $("#acces").hidden;
    $("#formBody").hidden = !dossierOuvert;
    if (dossierOuvert) reprendreBrouillon();
    buildLights();
    update();
  }
  $$('input[name="qui"]').forEach(r => r.addEventListener("change", () => setRole(r.value)));
  const ouvrirDepuisEntree = () => setTimeout(() => {
    if (role && !$("#acces").hidden && accesPret()) $("#accesForm").requestSubmit();
  }, 0);
  $$('input[name="qui"]').forEach(r => { r.addEventListener("click", ouvrirDepuisEntree); r.addEventListener("change", ouvrirDepuisEntree); });

  /* ---------- Validation ---------- */
  function clearError(name) {
    const f = form.querySelector(`.field[data-field="${name}"]`); if (!f) return;
    f.classList.remove("invalid");
    const e = $(`#err-${name}`); if (e) e.textContent = "";
    $$(`[name="${name}"]`, f).forEach(i => i.removeAttribute("aria-invalid"));
  }
  function isValid(name) {
    const v = val(name), required = reqSet.has(name);
    if (!v.trim()) return !required;
    return V[name] ? V[name](v) : true;
  }
  function validateField(name, show) {
    const ok = isValid(name);
    if (show) {
      const f = form.querySelector(`.field[data-field="${name}"]`);
      if (f) {
        f.classList.toggle("invalid", !ok);
        const e = $(`#err-${name}`); if (e) e.textContent = ok ? "" : (MSG[name] || "Vérifiez ce champ.");
        $$(`[name="${name}"]`, f).forEach(i => ok ? i.removeAttribute("aria-invalid") : i.setAttribute("aria-invalid", "true"));
      }
    }
    return ok;
  }
  const VALIDATED = Object.keys(V);

  form.addEventListener("input", e => {
    const t = e.target, n = t.name; if (!n) return;
    if (t.classList.contains("js-km")) {
      const d = t.value.replace(/\D/g, "").slice(0, 7);
      t.value = d ? fmtN(parseInt(d, 10)) : "";
    }
    if (t.classList.contains("js-eur")) {
      t.value = t.value.replace(/[^\d,.\s]/g, "").replace(".", ",");
    }
    if (n === "immat") formatImmat(t);
    if (n === "naf") t.value = t.value.toUpperCase().replace(/[^0-9A-Z.]/g, "");
    if (n === "siret") { const d = t.value.replace(/\D/g, "").slice(0, 14); t.value = d.replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,5}).*/, (m, a, b, c, e) => [a, b, c, e].filter(Boolean).join(" ")); }
    if (n === "description") updateCounter();
    if (touched.has(n) || form.querySelector(`.field[data-field="${n}"].invalid`)) validateField(n, true);
    update();
  });
  form.addEventListener("change", e => {
    const t = e.target, n = t.name; if (!n || n === "qui") return;
    if (t.type === "radio" || t.type === "checkbox" || t.tagName === "SELECT" || t.type === "date") { touched.add(n); if (VALIDATED.includes(n)) validateField(n, true); }
    if (n === "certification" && t.checked) clearError("certification");
    update();
  });
  form.addEventListener("focusout", e => {
    const t = e.target, n = t.name; if (!n || t.type === "radio" || t.type === "checkbox" || t.type === "file") return;
    if (!VALIDATED.includes(n)) return;
    if (t.value.trim() || touched.has(n)) { touched.add(n); validateField(n, true); }
  });

  function formaterPlaque(v) {
    let raw = String(v || "").toUpperCase().replace(/[^A-Z0-9\- ]/g, "");
    const compact = raw.replace(/[-\s]/g, "");
    if (/^[A-Z]{1,2}$/.test(compact) || /^[A-Z]{2}\d{1,3}$/.test(compact) || /^[A-Z]{2}\d{3}[A-Z]{0,2}$/.test(compact)) {
      raw = compact.slice(0, 2) + (compact.length > 2 ? "-" + compact.slice(2, 5) : "") + (compact.length > 5 ? "-" + compact.slice(5, 7) : "");
    }
    return raw;
  }
  function formatImmat(t) {
    const raw = formaterPlaque(t.value);
    t.value = raw;
    const ref = $("#refDisplay");
    if (raw && isImmat(raw)) {
      ref.innerHTML = "Véhicule <b></b>";
      ref.querySelector("b").textContent = raw;
    } else {
      ref.textContent = "Véhicule à renseigner";
    }
  }
  const AIDE_PANNE = {
    quand: /(\d{1,2}[\/. -]\d{1,2}|\d{1,2} (janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|matin|soir|nuit|hier|demarr|a froid|a chaud|moteur froid|moteur chaud)/,
    ou: /(ville|autoroute|route|nationale|departementale|km\/h|vitesse|cote|montee|descente|accelera|ralenti|stationn|parking|bouchon|embouteill|rond-point|demarrage)/,
    quoi: /(voyant|bruit|claqu|cogn|siffl|grince|fumee|puissance|vibr|fuite|odeur|surchauffe|temperature|a-coup|degrade|cale|ne demarre|demarre plus|tremble|patine)/,
    ensuite: /(arret|arrete|remorqu|depann|continue|roule|roulant|garage|stoppe|rentre|ramene|immobilis)/
  };
  function updateAidePanne() {
    const s = val("description").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    $$("#aidePanne li").forEach(li => li.classList.toggle("ok", AIDE_PANNE[li.dataset.aide].test(s)));
  }
  function updateCounter() {
    updateAidePanne();
    const n = val("description").trim().length, c = $("#counter-description");
    c.textContent = `${n} caractère${n > 1 ? "s" : ""}${n < 20 ? `, 20 minimum` : ""}`;
    c.classList.toggle("ok", n >= 20);
  }

  /* ---------- Avancement ---------- */
  // Barre de progression du bandeau d'une étape (part des éléments obligatoires remplis, sans pourcentage affiché)
  function avancerBandeau(idEtape, part) {
    const leg = document.querySelector(`#${idEtape} > .step-legend`);
    if (!leg) return;
    const v = Math.max(0, Math.min(1, part || 0));
    leg.style.setProperty("--avance", v.toFixed(3));
    leg.classList.toggle("is-complet", v >= 1);
  }
  function computeState() {
    const st = {}; let total = 0;
    sections().forEach(s => {
      const req = s.req[roleOf()];
      const okCount = req.filter(n => val(n).trim() && isValid(n)).length;
      st[s.key] = role ? okCount === req.length : false;
      total += role ? okCount / req.length : 0;
      avancerBandeau(s.step, role ? okCount / req.length : 0);
    });
    DOCS.filter(d => d.req).forEach(d => { st[d.key] = files[d.key].length > 0 || recuesDossier.has(d.key); if (st[d.key]) total += 1; });
    const piecesReq = DOCS.filter(d => d.req);
    avancerBandeau("step-pieces", role && piecesReq.length ? piecesReq.filter(d => st[d.key]).length / piecesReq.length : 0);
    const units = sections().length + DOCS.filter(d => d.req).length;
    return { st, p: total / units };
  }
  function update() {
    const { st, p } = computeState();
    lastState = st;
    if (!igniting) { setGauge(p); setLights(st); }
    const manqueInfos = orderedSections().filter(s => !st[s.key]).map(s => pick(s.miss));
    const manquePieces = DOCS.filter(d => d.req && !st[d.key]).map(d => d.miss);
    const status = $("#sendStatus");
    const bloquantes = piecesBloquantesManquantes().map(d => d.miss);
    status.textContent = manqueInfos.length
      ? `Encore à compléter : ${joinFr(manqueInfos)}.`
      : bloquantes.length
        ? `Pour envoyer, ajoutez ${joinFr(bloquantes)}.`
      : !piecesExigees()
        ? (manquePieces.length
          ? `Vous pouvez envoyer. Pièces non jointes à cet envoi : ${joinFr(manquePieces)} ; si elles ont déjà été transmises, BW Support les retrouvera au dossier.`
          : "Vous pouvez envoyer : BW Support vérifiera que le dossier est complet.")
      : manquePieces.length
        ? `Vous pouvez envoyer. Encore manquantes au dossier : ${joinFr(manquePieces)}. Le garage ou le client peut les envoyer avec ce même lien.`
        : "Le dossier est complet, vous pouvez l’envoyer.";
    status.classList.toggle("ready", !manqueInfos.length && !bloquantes.length);
  }

  /* ---------- Fiche de synthèse ---------- */
  function reperes() {
    const R = [];
    const ra = val("roulage_apres"); if (ra.startsWith("Oui")) R.push(`Le véhicule a roulé après les premiers symptômes (${ra.replace("Oui, ", "")}).`);
    const tr = val("travaux");
    if (tr === "Oui, la réparation a commencé") R.push("La réparation a commencé avant le dépôt du dossier.");
    if (tr === "Démontage pour diagnostic uniquement") R.push("Démontage réalisé pour le diagnostic.");
    return R;
  }
  function buildSynthese() {
    const L = [];
    const line = (label, value) => { if (value && String(value).trim()) L.push(`${label} : ${value}`); };
    const now = new Date();
    L.push("DOSSIER DE PRISE EN CHARGE – GARANTIE PANNE MÉCANIQUE");
    L.push(`Immatriculation : ${val("immat") || "non renseignée"}`);
    L.push(`Déposé le ${now.toLocaleDateString("fr-FR")} à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} par ${role === "garage" ? "le garage" : "le client"}`);
    L.push("", "1. CLIENT");
    line("Nom", [val("prenom").trim(), val("nom").trim().toUpperCase()].filter(Boolean).join(" "));
    line("Email", val("email")); line("Téléphone", val("telephone"));
    L.push("", "2. VÉHICULE");
    line("Marque et modèle", [val("marque").trim(), val("modele").trim()].filter(Boolean).join(" "));
    L.push("", "3. PANNE");
    line("Date", fmtDate(val("date_panne"))); line("Kilométrage", fmtKm(val("km")));
    line("Conditions d’apparition", checked("conditions").join(", "));
    line("Constats", checked("symptomes").join(", "));
    line("Voyants allumés", checked("voyants").join(", "));
    line("A roulé après les premiers symptômes", val("roulage_apres"));
    line("Roule encore", val("vehicule_roulant")); line("Remorqué jusqu’au garage", val("remorque"));
    line("Description", val("description").trim());
    L.push("", "4. GARAGE");
    line("Garage", val("garage_nom")); line("Ville", val("garage_ville"));
    line("SIRET", val("siret")); line("Code NAF", val("naf")); line("Nom du conseiller", val("garage_contact"));
    line("Téléphone", val("garage_tel")); line("Email", val("garage_email"));
    line("Entrée à l’atelier", fmtDate(val("date_depot"))); line("Montant du devis TTC", fmtEur(val("montant_devis")));
    line("Travaux déjà réalisés", val("travaux"));
    L.push("", "5. PIÈCES JOINTES À CET ENVOI");
    DOCS.filter(visible).forEach(d => L.push(`${d.title} : ${files[d.key].length ? files[d.key].map(f => f.name).join(", ") : "non joint à cet envoi"}`));
    const R = reperes();
    if (R.length) { L.push("", "6. REPÈRES CALCULÉS (à partir des déclarations, à confirmer sur pièces)"); R.forEach(r => L.push(`- ${r}`)); }
    return L.join("\n");
  }

  /* ---------- Envoi ---------- */
  form.addEventListener("submit", async e => {
    e.preventDefault();
    $("#sendError").textContent = "";
    let first = null;
    const mark = el => { if (!first) first = el; };
    if (!role) { $("#who").classList.add("invalid"); $("#err-qui").textContent = MSG.qui; mark($('input[name="qui"]')); }
    else {
      $$(".step .field[data-field]").forEach(f => {
        const n = f.dataset.field; if (!VALIDATED.includes(n)) return;
        touched.add(n);
        if (!validateField(n, true)) mark(form.querySelector(`[name="${n}"]`));
      });
      piecesBloquantesManquantes().forEach(d => {
        $(`#row-${d.key}`).classList.add("invalid");
        $(`#err-${d.key}`).textContent = d.missing || "Ajoutez ce document.";
        mark($(`#drop-${d.key} input`));
      });
      if (!$("#certification").checked) {
        const f = form.querySelector('.field[data-field="certification"]'); f.classList.add("invalid");
        $("#err-certification").textContent = MSG.certification; mark($("#certification"));
      }
    }
    if (first) {
      const box = first.closest(".field, .doc-row, .who") || first;
      box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      setTimeout(() => first.focus({ preventScroll: true }), reduceMotion ? 0 : 400);
      return;
    }

    const btn = $("#submitBtn");
    btn.disabled = true; btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>Envoi en cours…`;
    const synthese = buildSynthese();
    let manquantesDossier = null;
    accuseEnvoye = false;
    const status = $("#sendStatus");
    const etape = t => { status.textContent = t; status.classList.remove("ready"); };
    try {
      etape("Ouverture de l’envoi…");
      const client = [val("nom").trim().toUpperCase(), val("prenom").trim()].filter(Boolean).join(" ");
      let ouverture;
      try { ouverture = await serveur("ouvrirDossier", jetonSession, { client }); }
      catch (err) {
        if (!/^Votre session/.test(String((err && err.message) || ""))) throw err;
        // Session expirée (au-delà de 6 heures) : nouvelle session, sans perdre la saisie.
        const d = await chargerDossier(plaqueDossier);
        jetonSession = d.jeton || ""; consultation = !!d.acces;
        ouverture = await serveur("ouvrirDossier", jetonSession, { client });
      }
      const liste = DOCS.flatMap(d => files[d.key].map(f => ({ d, f })));
      for (let i = 0; i < liste.length; i++) {
        const { d, f } = liste[i];
        etape(`Envoi des pièces : ${i + 1} sur ${liste.length} (${f.name})`);
        const g = await allegerImage(f);
        if (g.size > CONFIG.maxFileMb * 1048576) throw new Error(`« ${f.name} » dépasse ${CONFIG.maxFileMb} Mo, même après allègement.`);
        const base64 = await enBase64(g);
        await serveur("ajouterPiece", ouverture.envoi, { categorie: d.key, nom: g.name, base64 });
      }
      etape("Transmission à BW Support…");
      const champs = champsSauves(); Object.keys(champs).forEach(k => { if (!CHAMPS_PARTAGES.includes(k)) delete champs[k]; });
      const bilan = await serveur("finaliserDossier", ouverture.envoi, { synthese, resume: resumeDossier(), champs });
      manquantesDossier = bilan && Array.isArray(bilan.manquantes) ? bilan.manquantes : null;
      accuseEnvoye = !!(bilan && bilan.accuse);
      showSuccess(synthese, manquantesDossier);
    } catch (err) {
      const detail = String((err && err.message) || "").replace(/^(Error|Exception|Erreur)\s?:\s?/i, "");
      $("#sendError").textContent = "L’envoi n’a pas abouti" + (detail ? ` : ${detail}` : ".") +
        " Vérifiez votre connexion puis cliquez de nouveau sur Envoyer : les informations et les pièces ajoutées sont conservées.";
      update();
      btn.disabled = false; btn.textContent = "Envoyer le dossier";
    }
  });

  let accuseEnvoye = false;

  /* Photos : redimensionnées (2 200 px au plus) et recompressées en JPEG avant l'envoi,
     pour un envoi plus rapide en 4G. En cas d'échec, le fichier d'origine est envoyé. */
  async function allegerImage(f) {
    const image = /^image\//i.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name);
    const natif = /^image\/(jpeg|png|heic|heif)$/i.test(f.type) || (!f.type && /\.(jpe?g|png|heic|heif)$/i.test(f.name));
    // Photos lourdes allégées ; images dans un autre format (WEBP, GIF…) converties en JPG, seul format photo accepté avec PNG et HEIC.
    if (!image || (natif && f.size < 1.5 * 1048576)) return f;
    let url = "";
    try {
      url = URL.createObjectURL(f);
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
      const k = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext("2d"); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.85));
      if (!blob || (natif && blob.size >= f.size)) return f;
      return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } catch (err) {
      return f;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  function resumeDossier() {
    return {
      role, immat: val("immat"),
      vehicule: [val("marque").trim(), val("modele").trim()].filter(Boolean).join(" "),
      client: [val("prenom").trim(), val("nom").trim().toUpperCase()].filter(Boolean).join(" "),
      clientEmail: val("email").trim(), clientTel: val("telephone").trim(),
      garage: [val("garage_nom").trim(), val("garage_ville").trim()].filter(Boolean).join(", "),
      garageContact: val("garage_contact").trim(), garageEmail: val("garage_email").trim(), garageTel: val("garage_tel").trim(),
      siret: val("siret").trim(), naf: val("naf").trim(),
      datePanne: fmtDate(val("date_panne")), km: fmtKm(val("km")),
      montantDevis: fmtEur(val("montant_devis")), travaux: val("travaux")
    };
  }

  function showSuccess(synthese, manquantesDossier) {
    const contact = role === "garage" ? val("garage_email") : val("email");
    const manquantes = manquantesDossier
      ? manquantesDossier.map(l => l.charAt(0).toLowerCase() + l.slice(1))
      : DOCS.filter(d => d.req && !files[d.key].length).map(d => d.miss);
    effacerBrouillon();
    const retour = contact ? ` et reviendra vers vous à l’adresse ${contact}.` : ".";
    $("#successText").textContent = consultation
      ? `Merci. Le dossier a bien été transmis à BW Support. Le gestionnaire en charge l’étudie${retour}` +
        (accuseEnvoye ? ` Un accusé de réception vient de vous être envoyé à cette adresse.` : "") +
        (manquantes.length
          ? ` Pièces encore manquantes au dossier : ${joinFr(manquantes)}. Le garage ou le client peut les ajouter avec ce même lien, l’immatriculation et la référence du contrat.`
          : " Toutes les pièces obligatoires du dossier ont été reçues.")
      : `Merci. Votre envoi a bien été transmis à BW Support. Le gestionnaire en charge l’étudie${retour}` +
        (accuseEnvoye ? ` Un accusé de réception vient de vous être envoyé à cette adresse.` : "");
    const nbFiles = DOCS.reduce((a, d) => a + files[d.key].length, 0);
    const rows = [
      ["Véhicule", [val("marque").trim(), val("modele").trim(), val("immat")].filter(Boolean).join(" ")],
      ["Panne", `${fmtDate(val("date_panne"))} à ${fmtKm(val("km"))}`],
      ["Garage", [val("garage_nom").trim(), val("garage_ville").trim()].filter(Boolean).join(", ")],
      ["Documents transmis", `${nbFiles} fichier${nbFiles > 1 ? "s" : ""}`]
    ];
    const dl = $("#recap"); dl.innerHTML = "";
    rows.forEach(([k, v]) => { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd); });
    if (!ENLIGNE) { $("#synthBlock").hidden = false; $("#synthText").textContent = synthese; }
    $("#intro").hidden = true; form.hidden = true; $("#success").hidden = false;
    const recu = d => manquantesDossier ? !manquantesDossier.includes(d.title) : files[d.key].length > 0;
    const obligatoires = DOCS.filter(d => d.req);
    lastState = Object.fromEntries([...sections().map(s => [s.key, true]), ...obligatoires.map(d => [d.key, recu(d)])]);
    setGauge((sections().length + obligatoires.filter(recu).length) / (sections().length + obligatoires.length));
    setLights(lastState);
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    $("#success").focus({ preventScroll: true });
  }
  $("#synthToggle").addEventListener("click", e => {
    const pre = $("#synthText"), open = pre.hidden;
    pre.hidden = !open; $("#synthCopy").hidden = !open;
    e.currentTarget.setAttribute("aria-expanded", String(open));
  });
  $("#synthCopy").addEventListener("click", async e => {
    const b = e.currentTarget, text = $("#synthText").textContent;
    try { await navigator.clipboard.writeText(text); }
    catch { const r = document.createRange(); r.selectNodeContents($("#synthText")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand("copy"); s.removeAllRanges(); }
    b.lastChild.textContent = "Fiche copiée"; setTimeout(() => { b.lastChild.textContent = "Copier la fiche"; }, 2000);
  });

  /* ---------- Accès au dossier : immatriculation + référence du contrat ---------- */
  const MSG_PROTEGE = {
    aucune: "Pour protéger les données, l’état d’un dossier ne s’affiche qu’avec l’immatriculation et la référence de contrat enregistrées. Vous pouvez déposer vos informations et vos pièces : elles seront transmises à BW Support.",
    trop: "Trop d’essais pour ce véhicule : l’affichage du dossier est suspendu pendant une heure. Vous pouvez tout de même déposer vos informations et vos pièces.",
    bloque: "L’affichage du dossier de ce véhicule est bloqué après plusieurs essais infructueux. Pour le débloquer, écrivez à BW Support : contact@bwsupport.fr. Vous pouvez tout de même déposer vos informations et vos pièces."
  };
  const accesInput = $("#accesImmat"), refInput = $("#accesRef");
  /* « PO-PM- » est affiché devant le champ, qui ne garde que les chiffres : « PO-PM-012345 » ou « popm 012345 »
     collés deviennent « 012345 ». Une référence de devis (QU-PM-…) collée est signalée. */
  let refEstDevis = false, lettresRef = "";
  const chiffresReference = v => String(v || "").replace(/\D/g, "").slice(0, 12);
  function formaterReference(v) { return "PO-PM-" + chiffresReference(v); }
  const refValide = v => !refEstDevis && /^\d{6}$/.test(chiffresReference(v));
  const refDevis = () => refEstDevis;
  const refAcces = () => formaterReference(refInput.value);
  const plaqueSaisie = () => formaterPlaque(accesInput.value).trim();
  // La référence du contrat est obligatoire : sans référence au bon format, ni consultation ni dépôt.
  const accesPret = () => isImmat(plaqueSaisie()) && refValide(refInput.value);
  async function chargerDossier(plaque) {
    return serveur("consulterDossier", plaque, refAcces(), role);
  }
  function afficherDossier(d, plaque) {
    const st = $("#dossierStatut"), protege = $("#dossierProtege"), table = $("#etatPieces");
    jetonSession = d.jeton || "";
    consultation = !!d.acces;
    if (!consultation) {
      $("#dossierTitre").textContent = `Véhicule ${plaque}`;
      $("#dossierSous").textContent = "Ajoutez vos informations et vos pièces ci-dessous.";
      protege.textContent = MSG_PROTEGE[d.motif] || MSG_PROTEGE.aucune;
      protege.hidden = false; st.hidden = true; table.hidden = true;
      champsDossier = {}; recuesDossier = new Set();
      DOCS.forEach(x => renderFiles(x.key));
      return;
    }
    protege.hidden = true; table.hidden = false;
    $("#dossierTitre").textContent = `Dossier ${plaque}`;
    const n = (d.envois || []).length;
    $("#dossierSous").textContent = `Ouvert le ${d.ouvertLe}, ${n} envoi${n > 1 ? "s" : ""} reçu${n > 1 ? "s" : ""}. Ajoutez vos éléments ci-dessous.`;
    st.hidden = !d.statut;
    if (d.statut) {
      const badge = $("#statutBadge"); badge.textContent = d.statut;
      badge.className = "statut" + (/tude/.test(d.statut) ? " etude" : /cision|clos/i.test(d.statut) ? " fin" : "");
      const msg = $("#statutMsg"); msg.textContent = d.message || ""; msg.hidden = !d.message;
    }
    champsDossier = d.champs || {};
    recuesDossier = new Set((d.pieces || []).filter(p => p.depots.length).map(p => p.categorie));
    DOCS.forEach(x => renderFiles(x.key));
    const tb = $("#etatPieces tbody"); tb.innerHTML = "";
    (d.pieces || []).forEach(p => {
      if (!p.obligatoire && !p.depots.length) return;
      const tr = document.createElement("tr");
      const c1 = document.createElement("td"); c1.className = "etat-piece"; c1.textContent = p.libelle;
      const c2 = document.createElement("td"); const b = document.createElement("span");
      b.className = "badge " + (p.depots.length ? "ok" : "attente"); b.textContent = p.depots.length ? "Reçue" : "À fournir"; c2.appendChild(b);
      const c3 = document.createElement("td");
      if (p.depots.length) {
        p.depots.forEach(dp => {
          const ligne = document.createElement("div"); ligne.className = "depot";
          const qui = document.createElement("span"); qui.className = "depot-qui"; qui.textContent = dp.par === "garage" ? "Garage" : "Client";
          const quand = document.createElement("span"); quand.className = "depot-date"; quand.textContent = ` le ${dp.le}`;
          ligne.append(qui, quand); c3.appendChild(ligne);
        });
      } else { c3.className = "depot-date"; c3.textContent = "Pas encore déposée"; }
      tr.append(c1, c2, c3); tb.appendChild(tr);
    });
  }
  let ouvertureEnCours = false;
  function majVerrouParties() {
    const entree = !$("#acces").hidden;
    const plaqueOk = isImmat(plaqueSaisie());
    const refOk = refValide(refInput.value);
    const actif = !entree || (plaqueOk && refOk);
    $("#who").classList.toggle("verrou", !actif);
    $$('input[name="qui"]').forEach(r => { r.disabled = !actif || ouvertureEnCours; });
    const note = $("#whoVerrou");
    note.hidden = !entree;
    if (!entree) return;
    if (ouvertureEnCours) note.innerHTML = '<span class="spinner" aria-hidden="true"></span>Ouverture du dossier…';
    else note.textContent = !plaqueOk ? "Saisissez la plaque d’immatriculation ci-dessus pour activer votre choix."
      : !refOk ? "Saisissez la référence du contrat (PO-PM- suivi de six chiffres) pour activer votre choix."
      : role ? "Cliquez sur la partie sélectionnée pour ouvrir le dossier."
      : "Choisissez votre partie : le dossier s’ouvre automatiquement.";
  }
  accesInput.addEventListener("input", () => { accesInput.value = formaterPlaque(accesInput.value); $("#err-acces").textContent = ""; majVerrouParties(); });
  refInput.addEventListener("input", () => {
    const brut = refInput.value, lettres = brut.replace(/[^A-Za-z]/g, "").toUpperCase();
    if (!brut) { lettresRef = ""; refEstDevis = false; }
    else if (lettres) {
      lettresRef = (lettresRef + lettres).slice(-6);
      if (/QU/.test(lettresRef)) refEstDevis = true;
      if (/PO/.test(lettresRef)) { refEstDevis = false; lettresRef = ""; }
    }
    refInput.value = chiffresReference(brut);
    $("#err-ref").textContent = refDevis(refInput.value) ? MSG.refDevis : "";
    majVerrouParties();
  });
  refInput.addEventListener("blur", () => {
    if (refInput.value && !refValide(refInput.value)) $("#err-ref").textContent = refDevis(refInput.value) ? MSG.refDevis : MSG.ref;
  });
  [accesInput, refInput].forEach(el => el.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); $("#accesForm").requestSubmit(); }
  }));
  $("#accesForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (ouvertureEnCours) return;
    const plaque = plaqueSaisie();
    if (!isImmat(plaque)) { $("#err-acces").textContent = MSG.immat; accesInput.focus(); return; }
    if (!refValide(refInput.value)) { $("#err-ref").textContent = refDevis(refInput.value) ? MSG.refDevis : MSG.ref; refInput.focus(); return; }
    if (!role) { majVerrouParties(); $("#who").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); return; }
    ouvertureEnCours = true; majVerrouParties();
    let echec = "";
    try {
      const d = await chargerDossier(plaque);
      if (plaqueDossier && plaque !== plaqueDossier) { viderChamps(); brouillonRepris = ""; }
      afficherDossier(d, plaque);
      plaqueDossier = plaque;
      const champ = $("#immat"); champ.value = plaque; champ.readOnly = true; formatImmat(champ);
      touched.add("immat"); validateField("immat", true);
      $("#acces").hidden = true; $("#dossier").hidden = false; $("#who").hidden = false;
      majVerrouParties();
      if (role) { $("#formBody").hidden = false; reprendreBrouillon(); }
      update();
      $("#dossier").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    } catch (err) {
      echec = String((err && err.message) || "").replace(/^(Error|Exception|Erreur)\s?:\s?/i, "");
      $("#err-acces").textContent = "Le dossier n’a pas pu être ouvert" + (echec ? ` : ${echec}` : ".") + " Vérifiez votre connexion puis réessayez.";
    } finally {
      ouvertureEnCours = false; majVerrouParties();
      if (echec !== "") $("#whoVerrou").textContent = "Le dossier n’a pas pu être ouvert. Vérifiez votre connexion, puis choisissez de nouveau votre partie.";
    }
  });
  $("#changerVehicule").addEventListener("click", () => {
    $("#dossier").hidden = true; $("#formBody").hidden = true; $("#acces").hidden = false;
    consultation = false; jetonSession = "";
    refInput.value = ""; refEstDevis = false; lettresRef = ""; $("#err-ref").textContent = "";
    accesInput.value = plaqueDossier; majVerrouParties(); accesInput.focus(); accesInput.select();
  });
  $("#retourDossier").addEventListener("click", async () => {
    DOCS.forEach(d => { files[d.key] = []; renderFiles(d.key); $(`#err-${d.key}`).textContent = ""; });
    $("#certification").checked = false;
    const btn = $("#submitBtn"); btn.disabled = false; btn.textContent = "Envoyer le dossier";
    $("#sendError").textContent = "";
    $("#success").hidden = true; $("#intro").hidden = false; form.hidden = false;
    // Sans consultation, rien à rafraîchir : le jeton de session reste valable pour un nouvel envoi.
    if (consultation) { try { afficherDossier(await chargerDossier(plaqueDossier), plaqueDossier); } catch (err) { } }
    update();
    $("#dossier").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  });

  /* ---------- Brouillon sur l'appareil : seulement à la demande, conservé 7 jours ---------- */
  const CLE_BROUILLON = "beweal-brouillon:", CLE_DERNIER = "beweal-dernier";
  const DUREE_BROUILLON = 7 * 86400000;
  const stock = {
    lire(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (err) { return null; } },
    ecrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (err) { } },
    retirer(k) { try { localStorage.removeItem(k); } catch (err) { } },
    cles() { try { return Object.keys(localStorage); } catch (err) { return []; } }
  };
  /* Efface réellement les brouillons expirés (et ceux des versions précédentes, enregistrés sans demande). */
  function purgerBrouillons() {
    stock.cles().forEach(k => {
      if (k !== CLE_DERNIER && !k.startsWith(CLE_BROUILLON)) return;
      let b = null;
      try { b = JSON.parse(localStorage.getItem(k)); } catch (err) { b = null; }
      if (!b || b.v3 !== true || !b.t || Date.now() - b.t > DUREE_BROUILLON) stock.retirer(k);
    });
  }
  const cleBrouillon = () => `${CLE_BROUILLON}${plaqueDossier}:${role}`;
  const NON_SAUVES = new Set(["qui", "immat", "certification"]);
  let brouillonRepris = "";
  let brouillonActif = false;
  let minuteur = 0;
  function champsSauves() {
    const v = {};
    Array.from(form.elements).forEach(el => {
      const n = el.name;
      if (!n || NON_SAUVES.has(n) || el.type === "file" || el.disabled) return;
      if (el.type === "radio") { if (el.checked) v[n] = el.value; }
      else if (el.type === "checkbox") { v[n] = v[n] || []; if (el.checked) v[n].push(el.value); }
      else if (el.value) v[n] = el.value;
    });
    Object.keys(v).forEach(k => { if (Array.isArray(v[k]) && !v[k].length) delete v[k]; });
    return v;
  }
  function afficherEtatBrouillon(texteReprise) {
    $("#brouillonOpt").hidden = brouillonActif;
    const textes = [];
    if (texteReprise) textes.push(texteReprise);
    if (brouillonActif) {
      const fin = new Date(Date.now() + DUREE_BROUILLON).toLocaleDateString("fr-FR");
      textes.push(`Brouillon enregistré sur cet appareil jusqu’au ${fin} ; il est mis à jour à chaque modification.`);
    }
    $("#brouillonTexte").textContent = textes.join(" ");
    $("#brouillon").hidden = !textes.length;
  }
  function sauverBrouillon(force) {
    if (!brouillonActif || !plaqueDossier || !role || form.hidden) return;
    const v = champsSauves();
    if (!force && !Object.keys(v).length) return;
    stock.ecrire(cleBrouillon(), { v3: true, t: Date.now(), v });
    stock.ecrire(CLE_DERNIER, { v3: true, plaque: plaqueDossier, role, t: Date.now() });
  }
  function planifierSauvegarde() { if (!brouillonActif) return; clearTimeout(minuteur); minuteur = setTimeout(sauverBrouillon, 400); }
  form.addEventListener("input", planifierSauvegarde);
  form.addEventListener("change", planifierSauvegarde);
  window.addEventListener("pagehide", () => sauverBrouillon());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sauverBrouillon(); });
  $("#brouillonActiver").addEventListener("click", () => {
    brouillonActif = true;
    sauverBrouillon(true);
    afficherEtatBrouillon("");
    $("#brouillonEffacer").focus();
  });

  function remplirChamps(v) {
    Object.entries(v).forEach(([n, val]) => {
      $$(`[name="${n}"]`, form).forEach(el => {
        if (el.type === "radio") el.checked = el.value === val;
        else if (el.type === "checkbox") el.checked = Array.isArray(val) && val.includes(el.value);
        else if (el.type !== "file") el.value = val;
      });
      touched.add(n);
    });
    VALIDATED.forEach(n => { if (v[n] !== undefined) validateField(n, true); });
  }
  function reprendreBrouillon() {
    if (!plaqueDossier || !role) return;
    const cle = cleBrouillon();
    if (brouillonRepris === cle) return;
    brouillonRepris = cle;
    const textes = [];
    const partages = {};
    Object.keys(champsDossier).forEach(k => { if (CHAMPS_PARTAGES.includes(k)) partages[k] = champsDossier[k]; });
    if (Object.keys(partages).length) {
      remplirChamps(partages);
      textes.push("Les informations déjà transmises pour ce véhicule (garage, véhicule, panne) ont été reprises : vérifiez-les et complétez si besoin.");
    }
    const b = stock.lire(cle);
    brouillonActif = false;
    if (b && b.v3 === true && b.v && Date.now() - b.t <= DUREE_BROUILLON) {
      remplirChamps(b.v);
      brouillonActif = true;
      const quand = new Date(b.t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", " à ");
      textes.push(`Votre saisie du ${quand} a été reprise. Les fichiers joints sont à ajouter de nouveau.`);
    }
    updateCounter();
    afficherEtatBrouillon(textes.join(" "));
    update();
  }
  function viderChamps() {
    Array.from(form.elements).forEach(el => {
      if (!el.name || NON_SAUVES.has(el.name) || el.type === "file") return;
      if (el.type === "radio" || el.type === "checkbox") el.checked = false; else el.value = "";
      clearError(el.name); touched.delete(el.name);
    });
    DOCS.forEach(d => { files[d.key] = []; renderFiles(d.key); });
    updateCounter();
  }
  function effacerBrouillon() {
    if (plaqueDossier && role) stock.retirer(cleBrouillon());
    const d = stock.lire(CLE_DERNIER);
    if (d && d.plaque === plaqueDossier) stock.retirer(CLE_DERNIER);
    brouillonActif = false;
    $("#brouillon").hidden = true;
    $("#brouillonOpt").hidden = false;
  }
  $("#brouillonEffacer").addEventListener("click", () => {
    effacerBrouillon();
    viderChamps(); update();
  });
  function proposerReprise() {
    const d = stock.lire(CLE_DERNIER);
    if (!d || d.v3 !== true || !d.plaque || Date.now() - d.t > DUREE_BROUILLON) return;
    if (!stock.lire(`${CLE_BROUILLON}${d.plaque}:${d.role}`)) return;
    $("#repriseTexte").textContent = `Un brouillon est enregistré sur cet appareil pour le véhicule ${d.plaque} (${d.role === "garage" ? "partie professionnelle" : "partie client"}).`;
    $("#reprise").hidden = false;
    $("#repriseBtn").onclick = () => {
      const r = form.querySelector(`input[name="qui"][value="${d.role}"]`);
      if (r) { r.checked = true; setRole(d.role); }
      accesInput.value = d.plaque;
      $("#reprise").hidden = true;
      majVerrouParties();
      refInput.focus();
    };
  }

  /* ---------- Démarrage ---------- */
  const t = todayISO();
  $$('input[type="date"]').forEach(i => { i.max = t; i.min = "1950-01-01"; });
  buildLights();
  updateCounter();
    const seen = {};
  $$("input:not([id])", form).forEach(i => { const k = i.name || "champ"; seen[k] = (seen[k] || 0) + 1; i.id = `${k}-${seen[k]}`; });
  const hashRole = location.hash.replace("#", "");
  const qp = [hashRole, new URLSearchParams(location.search).get("qui")].find(v => v === "garage" || v === "client");
  if (qp === "garage" || qp === "client") { const r = form.querySelector(`input[name="qui"][value="${qp}"]`); r.checked = true; setRole(qp); }
  update();
  // Les anciens liens « ?immat=… » ne sont plus utilisés : l’immatriculation est retirée de l’adresse affichée.
  if (new URLSearchParams(location.search).has("immat")) history.replaceState(null, "", location.pathname + (qp ? `?qui=${qp}` : "") + location.hash);
  purgerBrouillons();
  majVerrouParties();
  proposerReprise();

  // Mise du contact : tous les voyants s'allument et l'aiguille balaie le cadran, comme au démarrage d'un véhicule.
  if (!reduceMotion) {
    igniting = true;
    setLights({}, true);
    setTimeout(() => setGauge(1, false), 250);
    setTimeout(() => setGauge(computeState().p, false), 950);
    setTimeout(() => { igniting = false; update(); }, 1500);
  }
})();
