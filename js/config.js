/*
 * Configuration de la plateforme (Projet 4) : choisie automatiquement selon l'adresse de l'appli.
 *  - ouverte sur cet ordinateur (localhost)  -> base de DÉVELOPPEMENT (Supabase local, Docker)
 *  - ouverte en ligne (GitHub Pages / OVH)   -> base de PRODUCTION (projet Supabase Paris)
 * Tant que la production n'est pas renseignée, l'appli en ligne fonctionne en mode « local »
 * (sans compte, envoi des fiches par mail) : rien ne casse.
 * Ne JAMAIS mettre ici la clé « service_role » / « secret » : seule la clé publique (anon / publishable).
 */
(function () {
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var DEV = {
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseAnonKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', // clé publique de démo, identique sur toute installation locale
    environnement: 'développement'
  };
  var PROD = {
    supabaseUrl: '',      // ex. https://xxxxxxxx.supabase.co  (à renseigner après création du projet)
    supabaseAnonKey: '',  // clé publique du projet
    environnement: 'production'
  };
  window.ES_CONFIG = local ? DEV : PROD;
})();
