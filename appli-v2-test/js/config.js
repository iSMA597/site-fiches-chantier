/*
 * Configuration de la plateforme (Projet 4) : choisie automatiquement selon l'adresse de l'appli.
 *  - ouverte sur cet ordinateur (localhost)  -> base de DÉVELOPPEMENT (Supabase local, Docker)
 *  - ouverte en ligne sur /appli-v2-test/    -> base de TEST (projet fiches-chantier-test, données fictives)
 *  - ouverte en ligne ailleurs               -> base de PRODUCTION (projet Supabase Paris)
 * Tant que la production n'est pas renseignée, l'appli en ligne fonctionne en mode « local »
 * (sans compte, envoi des fiches par mail) : rien ne casse.
 * Ne JAMAIS mettre ici la clé « service_role » / « secret » ni la clé VAPID privée : seulement les clés publiques.
 */
(function () {
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var DEV = {
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseAnonKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', // clé publique de démo, identique sur toute installation locale
    vapidPublique: 'BMnvz6KdLm6WjsHHZ5RIBHpzYp_wLUoBXf2qnanDgwIIxOT2HHt7mSSTAq9jVaioZ_0Ne3tsexF7svjrOQQeBJA',   // notifications (clé publique)
    prefixe: 'es2d_',     // mémoire du téléphone propre à cet environnement
    environnement: 'développement'
  };
  var TEST = {
    supabaseUrl: 'https://hwcvleonfmybxudeymal.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3Y3ZsZW9uZm15Ynh1ZGV5bWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTI3NzQsImV4cCI6MjEwNjk4ODc3NH0.48Wh63oxFJlHAnaCKG_bKy4MON2pFkkRN4mlJ-Gb1hg',   // clé publique (anon)
    vapidPublique: 'BI4gmM1r5aRFaY57PdNBTDOv8Pd-ZlbsMM3nKyi5qYMVNiHxtksMXh-gQKuaZ-28vmD5KUgEh8KPuRJsErVGCeo',
    prefixe: 'es2t_',
    environnement: 'test'
  };
  var PROD = {
    supabaseUrl: 'https://xyfnbdkikkhtbixdekxt.supabase.co',     // projet fiches-chantier (Paris)
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5Zm5iZGtpa2todGJpeGRla3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjk2NTYsImV4cCI6MjEwNjcwNTY1Nn0.YUIiAmjZNqCyYVG6_hemSLJfeEnDssFOixWxBnnT8O4',   // clé publique (anon)
    vapidPublique: 'BHmang965YZnN7SyeqVHptzJ55ohov4ja3y9fpYHXlYZXEsMuFda5QxlNHx9pQNFn3yVC_TW6Gc4SDG26qi4Ilw',
    prefixe: 'es2_',
    environnement: 'production'
  };
  var test = /\/appli-v2-test\//.test(location.pathname);
  window.ES_CONFIG = local ? DEV : (test ? TEST : PROD);
})();
