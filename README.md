# Layout web

Ce dossier contient une version statique du roman prête pour GitHub Pages.

## Structure

- `index.html` : table des chapitres.
- `chapitres/` : pages HTML des chapitres.
- `chapters.json` : liste ordonnée des chapitres à publier (numéro, titre, sous-titre, source Markdown, fichier de sortie, extrait).
- `assets/styles.css` : charte graphique partagée.
- `assets/reader.js` : réglages de lecture côté navigateur (thèmes, taille, largeur, reprise de lecture, raccourcis).
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

Pour reconstruire automatiquement à chaque modification d'une source Markdown, du CSS, du JS ou de `chapters.json` :

```bash
node layout/scripts/build-layout.mjs --watch
```

Pour ajouter ou réorganiser des chapitres, modifie simplement `chapters.json` — aucune édition du script n'est nécessaire.

Pour convertir ponctuellement un autre Markdown en respectant le layout :

```bash
node layout/scripts/build-layout.mjs --source chapitres/mon-chapitre.md --title "Mon chapitre" --subtitle "Lieu" --number 6 --output chapitres/mon-chapitre.html
```

## Messagerie et SMS

Les blocs Markdown `>` sont présentés comme des citations classiques. Pour afficher une bulle de messagerie instantanée, ajoute obligatoirement le sens et le nom de l'auteur :

```markdown
> Une citation classique
> [→ Lycoris] Message envoyé par Lycoris
> [← Geb] Message reçu de Geb
```

Les marqueurs `[→ NOM]` et `[← NOM]` imposent le sens de la bulle et affichent le nom de l'auteur au-dessus de celle-ci. Le marqueur lui-même n'est pas affiché dans la page HTML.

## Raccourcis clavier (page de lecture)

- `←` / `→` : chapitre précédent / suivant.
- `+` / `-` / `0` : agrandir, réduire, réinitialiser la taille du texte.
- `t` : basculer en thème nuit (et revenir au précédent). `Shift + T` : faire défiler les cinq thèmes.
- `w` : faire défiler les trois largeurs de colonne.

La position de lecture est mémorisée par chapitre et restaurée à la prochaine ouverture.

## Déploiement

Pour publier ce dossier comme racine du site, configure GitHub Pages avec une action qui publie le contenu de `layout/`, ou copie son contenu dans la branche ou le dossier utilisé comme source Pages.
