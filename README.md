# Layout web

Ce dossier contient une version statique du roman prête pour GitHub Pages.

## Structure

- `index.html` : table des chapitres.
- `chapitres/` : pages HTML des chapitres.
- `assets/styles.css` : charte graphique partagée.
- `assets/reader.js` : réglages de lecture côté navigateur.
- `scripts/build-layout.mjs` : générateur Markdown vers HTML.
- `.nojekyll` : demande à GitHub Pages de servir les fichiers sans traitement Jekyll.

## Génération

Depuis la racine du projet :

```bash
node layout/scripts/build-layout.mjs
```

Le script reconstruit les chapitres configurés, met à jour `index.html`, recalcule le nombre de mots et le temps de lecture, puis conserve la navigation entre chapitres, les thèmes et la barre de progression.

Pour ne reconstruire qu'un chapitre :

```bash
node layout/scripts/build-layout.mjs --chapter la-baronne-radieuse-de-vinterhavn
```

Pour vérifier si le HTML est à jour sans rien écrire :

```bash
node layout/scripts/build-layout.mjs --check
```

Pour convertir ponctuellement un autre Markdown en respectant le layout :

```bash
node layout/scripts/build-layout.mjs --source chapitres/mon-chapitre.md --title "Mon chapitre" --subtitle "Lieu" --number 6 --output chapitres/mon-chapitre.html
```

## Déploiement

Pour publier ce dossier comme racine du site, configure GitHub Pages avec une action qui publie le contenu de `layout/`, ou copie son contenu dans la branche ou le dossier utilisé comme source Pages.
