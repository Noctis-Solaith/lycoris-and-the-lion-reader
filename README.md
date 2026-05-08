# Layout web

Ce dossier contient une version statique du roman prête pour GitHub Pages.

## Structure

- `index.html` : table des chapitres.
- `chapitres/` : pages HTML des chapitres.
- `assets/styles.css` : charte graphique partagée.
- `assets/reader.js` : réglages de lecture côté navigateur.
- `.nojekyll` : demande à GitHub Pages de servir les fichiers sans traitement Jekyll.

## Déploiement

Pour publier ce dossier comme racine du site, configure GitHub Pages avec une action qui publie le contenu de `layout/`, ou copie son contenu dans la branche ou le dossier utilisé comme source Pages.
