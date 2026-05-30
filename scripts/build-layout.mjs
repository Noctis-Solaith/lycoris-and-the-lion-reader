import { mkdir, readFile, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const layoutRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(layoutRoot, "..");
const chaptersDir = path.join(layoutRoot, "chapitres");
const chaptersConfig = path.join(layoutRoot, "chapters.json");
const wordsPerMinute = 219;

const loadChapters = async () => {
  const raw = await readFile(chaptersConfig, "utf8");
  return JSON.parse(raw);
};

const fingerprint = async file => {
  const content = await readFile(file);
  return createHash("sha1").update(content).digest("hex").slice(0, 8);
};

const escapeHtml = value =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const inlineMarkdown = value => {
  const placeholders = [];
  let html = escapeHtml(value);

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const key = `@@CODE${placeholders.length}@@`;
    placeholders.push(`<code>${code}</code>`);
    return key;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const key = `@@LINK${placeholders.length}@@`;
    const safeUrl = url.trim();
    const external = /^https?:/i.test(safeUrl);
    const attrs = external ? ' rel="noopener noreferrer" target="_blank"' : "";
    placeholders.push(`<a href="${safeUrl}"${attrs}>${text}</a>`);
    return key;
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  placeholders.forEach((replacement, index) => {
    html = html.replaceAll(`@@CODE${index}@@`, replacement);
    html = html.replaceAll(`@@LINK${index}@@`, replacement);
  });

  return html;
};

const normalizeMarkdown = value =>
  value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

const stripFirstHeading = value => value.replace(/^# .*(?:\n+|$)/, "").trim();

const isDialogue = value => /^[—–]\s+/.test(value);

const isWhisper = value =>
  /\b(murmura(?:i[ts]?|nt|ient)?|chuchota(?:i[ts]?|nt|ient)?|souffla(?:i[ts]?|nt|ient)?|à voix basse|à mi-voix|plus bas|tout bas)\b/i.test(
    value
  );

const paragraphHtml = value => {
  const classNames = [];
  if (isDialogue(value)) {
    classNames.push("dialogue");
  }
  if (isWhisper(value)) {
    classNames.push("whisper");
  }

  const classAttribute = classNames.length ? ` class="${classNames.join(" ")}"` : "";
  return `<p${classAttribute}>${inlineMarkdown(value)}</p>`;
};

const parseMessageParagraph = value => {
  const marker = value.match(/^\s*\[([←→])\s+([^\]]+?)\]\s*/);
  return {
    direction: marker ? (marker[1] === "→" ? "sent" : "received") : null,
    author: marker?.[2]?.trim() || null,
    text: marker ? value.slice(marker[0].length).trim() : value.trim()
  };
};

const hasNamedMessageMarker = block => /^>\s*\[[←→]\s+[^\]]+\]\s*/m.test(block);

const messagesHtml = block => {
  const paragraphs = block
    .split("\n")
    .map(line => line.replace(/^>\s?/, ""))
    .join("\n")
    .split(/\n{2,}/)
    .map(part => parseMessageParagraph(part.replace(/\n/g, " ").trim()))
    .filter(part => part.text);

  const bubbles = paragraphs
    .map(paragraph => {
      const direction = paragraph.direction ?? "neutral";
      const author = paragraph.author
        ? `        <span class="message-author">${escapeHtml(paragraph.author)}</span>\n`
        : "";
      return `      <div class="message message--${direction}">\n${author}        <p class="message-bubble message-bubble--${direction}">${inlineMarkdown(paragraph.text)}</p>\n      </div>`;
    })
    .join("\n");

  return `    <div class="messages" role="group" aria-label="Conversation par messagerie">\n${bubbles}\n    </div>`;
};

const blockquoteHtml = block => {
  const paragraphs = block
    .split("\n")
    .map(line => line.replace(/^>\s?/, ""))
    .join("\n")
    .split(/\n{2,}/)
    .map(part => part.replace(/\n/g, " ").replace(/^\s*\[[←→]\]\s*/, "").trim())
    .filter(Boolean)
    .map(paragraph => `      <p>${inlineMarkdown(paragraph)}</p>`)
    .join("\n");

  return `    <blockquote>\n${paragraphs}\n    </blockquote>`;
};

const markdownToBlocks = markdown => {
  const source = stripFirstHeading(normalizeMarkdown(markdown));
  const blocks = [];
  const lines = source.split("\n");
  let current = [];
  let blockquote = [];

  const flushParagraph = () => {
    if (!current.length) return;
    blocks.push({ type: "paragraph", text: current.join(" ").trim() });
    current = [];
  };

  const flushBlockquote = () => {
    if (!blockquote.length) return;
    blocks.push({ type: "blockquote", text: blockquote.join("\n") });
    blockquote = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushBlockquote();
      continue;
    }

    if (/^\*{3,}$/.test(trimmed)) {
      flushParagraph();
      flushBlockquote();
      blocks.push({ type: "break" });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      blockquote.push(trimmed);
      continue;
    }

    flushBlockquote();

    if (isDialogue(trimmed)) {
      flushParagraph();
      blocks.push({ type: "paragraph", text: trimmed });
      continue;
    }

    current.push(trimmed);
  }

  flushParagraph();
  flushBlockquote();

  while (blocks.at(-1)?.type === "break") {
    blocks.pop();
  }

  return blocks;
};

const renderChapterBody = (markdown, chapter) => {
  const blocks = markdownToBlocks(markdown);
  const openingIndexes = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.type === "paragraph" && !isDialogue(block.text))
    .slice(0, 2)
    .map(({ index }) => index);

  const [openingStart, openingEnd] = openingIndexes;
  const hasOpeningClose = openingIndexes.length >= 2;

  return blocks
    .map((block, index) => {
      if (block.type === "break") {
        return '    <div class="scene-break"></div>';
      }

      if (block.type === "blockquote") {
        return (hasNamedMessageMarker(block.text) ? messagesHtml(block.text) : blockquoteHtml(block.text))
          .split("\n")
          .map(line => `      ${line}`)
          .join("\n");
      }

      const html = `      ${paragraphHtml(block.text)}`;
      if (index === openingStart && hasOpeningClose) {
        return `    <section class="opening">\n\n${html}`;
      }
      if (index === openingStart && !hasOpeningClose) {
        return `    <section class="opening">\n\n${html}\n\n    </section>`;
      }
      if (index === openingEnd) {
        return `${html}\n\n    </section>`;
      }
      return html;
    })
    .join("\n\n");
};

const plainTextForStats = markdown =>
  stripFirstHeading(normalizeMarkdown(markdown))
    .replace(/^>\s?(?:\[[←→](?:\s+[^\]]+)?\]\s*)?/gm, "")
    .replace(/^\*{3,}$/gm, " ")
    .replace(/[`*_#[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const countWords = markdown =>
  plainTextForStats(markdown).match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;

const formatNumber = value => new Intl.NumberFormat("fr-FR").format(value).replace(/\s/g, " ");

const readingTime = words => {
  const minutes = Math.max(1, Math.round(words / wordsPerMinute));
  if (minutes < 60) {
    return `${minutes} min de lecture`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} de lecture` : `${hours} h de lecture`;
};

const renderReaderActions = () => `      <div class="reader-actions" aria-label="Réglages de lecture">
        <label class="theme-control">
          <span>Thème</span>
          <select data-theme-select aria-label="Choisir le thème de lecture">
            <option value="paper">Papier</option>
            <option value="sepia">Sépia</option>
            <option value="night">Nuit</option>
            <option value="lycoris">Lycoris</option>
            <option value="lion">Lion</option>
          </select>
        </label>
        <button class="reader-button" type="button" data-theme-toggle aria-pressed="false" aria-label="Basculer en thème nuit" title="Basculer en thème nuit">☾</button>
        <button class="reader-button" type="button" data-width-toggle aria-label="Changer la largeur de colonne" title="Changer la largeur de colonne (W)">⇿</button>
        <button class="reader-button" type="button" data-font-decrease aria-label="Réduire la taille du texte" title="Réduire la taille du texte (−)">A−</button>
        <button class="reader-button" type="button" data-font-reset aria-label="Réinitialiser la taille du texte" title="Réinitialiser la taille du texte (0)">A</button>
        <button class="reader-button" type="button" data-font-increase aria-label="Augmenter la taille du texte" title="Augmenter la taille du texte (+)">A+</button>
      </div>`;

const renderHead = (title, cssHref, jsHref, assets) =>
  `  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${cssHref}?v=${assets.css}" />
  <script src="${jsHref}?v=${assets.js}" defer></script>`;

const navItem = (chapter, kind) => {
  if (!chapter) {
    const label = kind === "prev" ? "Chapitre précédent" : "Chapitre suivant";
    return `      <span class="${kind} disabled" aria-disabled="true">${label}</span>`;
  }

  const label = kind === "prev" ? `‹ ${chapter.title}` : `${chapter.title} ›`;
  return `      <a class="${kind}" href="${chapter.output}">${escapeHtml(label)}</a>`;
};

const renderChapterPage = (chapter, previous, next, markdown, assets) => {
  const words = countWords(markdown);
  const formattedWords = `${formatNumber(words)} mots`;
  const minutes = Math.max(1, Math.round(words / wordsPerMinute));
  const time = readingTime(words);
  const chapterNumber = chapter.number ? `Chapitre ${chapter.number}` : "Chapitre";
  const pageTitle = chapter.number ? `${chapter.title} — Chapitre ${chapter.number}` : chapter.title;
  const slug = chapter.output.replace(/\.html$/, "");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
${renderHead(pageTitle, "../assets/styles.css", "../assets/reader.js", assets)}
</head>

<body class="chapter-page" data-chapter="${escapeHtml(slug)}" data-reading-minutes="${minutes}">
  <div class="reading-progress" role="progressbar" aria-label="Progression de lecture" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-reading-progress>
    <div class="reading-progress__bar" data-reading-progress-bar></div>
  </div>

  <a class="skip-link" href="#lecture">Aller au texte</a>

  <header class="reader-header" aria-label="Navigation du chapitre">
    <nav class="reader-bar">
      <a class="reader-link" href="../index.html">Table des chapitres</a>
${renderReaderActions()}
    </nav>
  </header>

  <main class="page" id="lecture">
    <div class="chapter-kicker">${escapeHtml(chapterNumber)}</div>
    <h1>${escapeHtml(chapter.title)}</h1>
    <div class="chapter-rule"></div>
    <div class="chapter-subtitle">${escapeHtml(chapter.subtitle)}</div>
    <div class="chapter-meta" aria-label="Longueur du chapitre">
      <span>${formattedWords}</span>
      <span>${time}</span>
    </div>

${renderChapterBody(markdown, chapter)}

    <p class="final-stars">✦ ✦ ✦</p>

    <nav class="chapter-nav" aria-label="Navigation entre les chapitres">
${navItem(previous, "prev")}
      <a class="current" href="../index.html">Table des chapitres</a>
${navItem(next, "next")}
    </nav>
  </main>
</body>
</html>
`;
};

const renderIndex = (chapterStats, assets) => `<!DOCTYPE html>
<html lang="fr">
<head>
${renderHead("Table des chapitres", "assets/styles.css", "assets/reader.js", assets)}
</head>

<body>
  <a class="skip-link" href="#chapitres">Aller aux chapitres</a>

  <header class="site-topline" aria-label="Réglages du site">
    <div class="site-tools">
      <a class="home-link is-current" href="index.html" aria-current="page">Table</a>
${renderReaderActions()}
    </div>
  </header>

  <main class="home">
    <header class="site-header">
      <div class="kicker">Roman</div>
      <h1>Table des chapitres</h1>
      <div class="rule"></div>
      <p class="subtitle">Version de lecture web</p>
      <p class="home-intro">Une entrée simple vers les chapitres mis en page, pensée pour une lecture longue sur écran et prête à être servie par GitHub Pages.</p>
    </header>

    <section class="library" id="chapitres" aria-labelledby="chapitres-title">
      <div class="library-head">
        <h2 class="section-label" id="chapitres-title">Chapitres disponibles</h2>
        <span class="library-count">${chapterStats.length} chapitres</span>
      </div>

      <ol class="chapter-list">
${chapterStats
  .map(
    chapter => `        <li class="chapter-card">
          <a class="chapter-link" href="chapitres/${chapter.output}">
            <span class="chapter-number">Chapitre ${chapter.number}</span>
            <span>
              <span class="chapter-title">${escapeHtml(chapter.title)}</span>
              <span class="chapter-place">${escapeHtml(chapter.subtitle)}</span>
              <span class="chapter-stats" aria-label="Longueur et temps de lecture">
                <span>${chapter.formattedWords}</span>
                <span>${chapter.time}</span>
              </span>
              <span class="chapter-excerpt">${escapeHtml(chapter.excerpt)}</span>
            </span>
            <span class="chapter-arrow" aria-hidden="true">›</span>
          </a>
        </li>`
  )
  .join("\n")}
      </ol>
    </section>

    <footer class="site-footer" aria-hidden="true">✦ ✦ ✦</footer>
  </main>
</body>
</html>
`;

const getSelectedChapters = (chapters, slug) => {
  if (!slug) return chapters;

  const selected = chapters.filter(
    chapter =>
      chapter.output.replace(/\.html$/, "") === slug ||
      String(chapter.number) === slug ||
      chapter.title.toLowerCase() === slug.toLowerCase()
  );

  if (!selected.length) {
    throw new Error(`Chapitre introuvable pour "${slug}".`);
  }

  return selected;
};

const computeAssetFingerprints = async () => ({
  css: await fingerprint(path.join(layoutRoot, "assets/styles.css")),
  js: await fingerprint(path.join(layoutRoot, "assets/reader.js"))
});

const writeIfChanged = async (file, content, checkOnly) => {
  let current = null;
  try {
    current = await readFile(file, "utf8");
  } catch {
    current = null;
  }

  if (current === content) return false;
  if (checkOnly) return true;

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return true;
};

const buildConfiguredChapters = async ({ checkOnly, chapterSlug }) => {
  const chapters = await loadChapters();
  const assets = await computeAssetFingerprints();
  const markdownByOutput = new Map();
  const stats = [];

  for (const chapter of chapters) {
    const markdown = await readFile(path.join(repoRoot, chapter.source), "utf8");
    markdownByOutput.set(chapter.output, markdown);
    const words = countWords(markdown);
    stats.push({
      ...chapter,
      words,
      formattedWords: `${formatNumber(words)} mots`,
      time: readingTime(words)
    });
  }

  const selected = getSelectedChapters(chapters, chapterSlug);
  const changed = [];

  for (const chapter of selected) {
    const index = chapters.indexOf(chapter);
    const html = renderChapterPage(
      chapter,
      chapters[index - 1],
      chapters[index + 1],
      markdownByOutput.get(chapter.output),
      assets
    );
    const file = path.join(chaptersDir, chapter.output);
    if (await writeIfChanged(file, html, checkOnly)) {
      changed.push(path.relative(layoutRoot, file));
    }
  }

  if (!chapterSlug) {
    const indexHtml = renderIndex(stats, assets);
    const indexFile = path.join(layoutRoot, "index.html");
    if (await writeIfChanged(indexFile, indexHtml, checkOnly)) {
      changed.push("index.html");
    }
  }

  return changed;
};

const buildSingleFile = async ({ source, title, subtitle, output, number, checkOnly }) => {
  if (!source || !title || !output) {
    throw new Error("Pour un fichier isolé, il faut fournir --source, --title et --output.");
  }

  const assets = await computeAssetFingerprints();
  const chapter = {
    number: number ?? "",
    title,
    subtitle: subtitle ?? "",
    output: path.basename(output),
    excerpt: ""
  };
  const markdown = await readFile(path.resolve(repoRoot, source), "utf8");
  const html = renderChapterPage(chapter, null, null, markdown, assets);
  const outputFile = path.resolve(layoutRoot, output);
  const changed = await writeIfChanged(outputFile, html, checkOnly);
  return changed ? [path.relative(layoutRoot, outputFile)] : [];
};

const debounce = (fn, ms) => {
  let handle = null;
  return (...args) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      fn(...args);
    }, ms);
  };
};

const runWatch = async () => {
  const rebuild = debounce(async () => {
    try {
      const changed = await buildConfiguredChapters({ checkOnly: false, chapterSlug: null });
      const stamp = new Date().toLocaleTimeString("fr-FR");
      console.log(
        changed.length
          ? `[${stamp}] Régénéré : ${changed.join(", ")}`
          : `[${stamp}] Aucun changement détecté.`
      );
    } catch (error) {
      console.error(`Erreur de génération : ${error.message}`);
    }
  }, 200);

  await rebuild();
  console.log("Surveillance des sources... Ctrl+C pour quitter.");

  const watched = [
    { target: path.join(repoRoot, "chapitres"), options: { recursive: true } },
    { target: chaptersConfig, options: {} },
    { target: path.join(layoutRoot, "assets"), options: { recursive: true } }
  ];

  for (const { target, options } of watched) {
    try {
      watch(target, options, rebuild);
    } catch (error) {
      console.warn(`Surveillance impossible pour ${target} : ${error.message}`);
    }
  }

  return new Promise(() => {});
};

const parseArgs = argv => {
  const args = {
    checkOnly: false,
    help: false,
    watch: false,
    chapterSlug: null,
    source: null,
    title: null,
    subtitle: null,
    output: null,
    number: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];

    if (arg === "--check") args.checkOnly = true;
    else if (arg === "--watch") args.watch = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--chapter") args.chapterSlug = next();
    else if (arg === "--source") args.source = next();
    else if (arg === "--title") args.title = next();
    else if (arg === "--subtitle") args.subtitle = next();
    else if (arg === "--output") args.output = next();
    else if (arg === "--number") args.number = next();
    else throw new Error(`Option inconnue : ${arg}`);
  }

  return args;
};

const printHelp = () => {
  console.log(`Usage:
  node layout/scripts/build-layout.mjs
  node layout/scripts/build-layout.mjs --chapter la-baronne-radieuse-de-vinterhavn
  node layout/scripts/build-layout.mjs --check
  node layout/scripts/build-layout.mjs --watch
  node layout/scripts/build-layout.mjs --source chapitres/mon-chapitre.md --title "Mon chapitre" --subtitle "Lieu" --number 6 --output chapitres/mon-chapitre.html

Options:
  --chapter   Régénère un seul chapitre configuré, par numéro, slug ou titre exact.
  --check     Vérifie si la génération modifierait des fichiers, sans écrire.
  --watch     Reste actif et reconstruit dès qu'une source change.
  --source    Convertit un Markdown isolé au lieu des chapitres configurés.
  --title     Titre de la page pour un Markdown isolé.
  --subtitle  Sous-titre de la page pour un Markdown isolé.
  --number    Numéro affiché pour un Markdown isolé.
  --output    Sortie relative au dossier layout/.
`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.watch) {
    await runWatch();
    return;
  }

  const changed = args.source ? await buildSingleFile(args) : await buildConfiguredChapters(args);

  if (args.checkOnly && changed.length) {
    console.error(`La génération modifierait : ${changed.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const verb = args.checkOnly ? "Aucun écart détecté" : "Génération terminée";
  console.log(changed.length ? `${verb} : ${changed.join(", ")}` : `${verb} : aucun fichier modifié`);
};

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
