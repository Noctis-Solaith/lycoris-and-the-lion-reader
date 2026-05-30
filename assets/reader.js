(() => {
  const root = document.documentElement;
  const body = document.body;
  const storageKeyTheme = "roman-reader-theme";
  const storageKeyPrevTheme = "roman-reader-prev-theme";
  const storageKeyScale = "roman-reader-scale";
  const storageKeyWidth = "roman-reader-width";
  const storageKeyScrollPrefix = "roman-reader-scroll:";
  const minScale = 0.78;
  const maxScale = 1.26;
  const step = 0.08;
  const widths = [
    { key: "narrow", value: "660px", label: "Colonne étroite" },
    { key: "normal", value: "820px", label: "Colonne normale" },
    { key: "wide", value: "980px", label: "Colonne large" }
  ];
  const themes = ["paper", "sepia", "night", "lycoris", "lion"];

  const read = (key, fallback) => {
    try {
      return window.localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Preferences remain session-only when storage is unavailable. */
    }
  };

  const clamp = value => Math.min(maxScale, Math.max(minScale, value));

  let scale = clamp(Number.parseFloat(read(storageKeyScale, "1")) || 1);
  let theme = read(storageKeyTheme, "paper");
  if (!themes.includes(theme)) theme = "paper";
  let prevTheme = read(storageKeyPrevTheme, "paper");
  if (!themes.includes(prevTheme) || prevTheme === "night") prevTheme = "paper";

  let widthIndex = widths.findIndex(w => w.key === read(storageKeyWidth, "normal"));
  if (widthIndex < 0) widthIndex = 1;

  const buttons = {
    decrease: document.querySelectorAll("[data-font-decrease]"),
    reset: document.querySelectorAll("[data-font-reset]"),
    increase: document.querySelectorAll("[data-font-increase]")
  };
  const themeSelects = document.querySelectorAll("[data-theme-select]");
  const themeToggles = document.querySelectorAll("[data-theme-toggle]");
  const widthToggles = document.querySelectorAll("[data-width-toggle]");
  const progress = document.querySelector("[data-reading-progress]");
  const progressBar = progress?.querySelector("[data-reading-progress-bar]");
  const readingMinutes = Number.parseInt(body?.dataset.readingMinutes ?? "", 10);
  const chapterSlug = body?.dataset.chapter ?? null;
  let updateReadingProgress = () => {};

  const applyScale = () => {
    root.style.setProperty("--reader-scale", scale.toFixed(2));
    write(storageKeyScale, scale.toFixed(2));
    updateReadingProgress();
  };

  const applyWidth = () => {
    const current = widths[widthIndex];
    root.style.setProperty("--reader-width", current.value);
    write(storageKeyWidth, current.key);
    widthToggles.forEach(button => {
      const nextLabel = widths[(widthIndex + 1) % widths.length].label;
      button.setAttribute("title", `${current.label} — clic pour passer à : ${nextLabel}`);
      button.setAttribute("aria-label", current.label);
    });
    updateReadingProgress();
  };

  const applyTheme = () => {
    root.dataset.theme = theme;
    write(storageKeyTheme, theme);
    if (theme !== "night") {
      prevTheme = theme;
      write(storageKeyPrevTheme, prevTheme);
    }
    themeSelects.forEach(select => {
      select.value = theme;
    });
    themeToggles.forEach(button => {
      const isNight = theme === "night";
      button.textContent = isNight ? "☀" : "☾";
      button.setAttribute("aria-pressed", String(isNight));
      const label = isNight ? "Quitter le thème nuit" : "Basculer en thème nuit (T)";
      button.setAttribute("title", label);
      button.setAttribute("aria-label", label);
    });
  };

  const cycleTheme = () => {
    const order = themes;
    theme = order[(order.indexOf(theme) + 1) % order.length];
    applyTheme();
  };

  const toggleNight = () => {
    theme = theme === "night" ? prevTheme || "paper" : "night";
    applyTheme();
  };

  const cycleWidth = () => {
    widthIndex = (widthIndex + 1) % widths.length;
    applyWidth();
  };

  buttons.decrease.forEach(button => {
    button.addEventListener("click", () => {
      scale = clamp(scale - step);
      applyScale();
    });
  });

  buttons.reset.forEach(button => {
    button.addEventListener("click", () => {
      scale = 1;
      applyScale();
    });
  });

  buttons.increase.forEach(button => {
    button.addEventListener("click", () => {
      scale = clamp(scale + step);
      applyScale();
    });
  });

  themeSelects.forEach(select => {
    select.addEventListener("change", () => {
      theme = themes.includes(select.value) ? select.value : "paper";
      applyTheme();
    });
  });

  themeToggles.forEach(button => {
    button.addEventListener("click", toggleNight);
  });

  widthToggles.forEach(button => {
    button.addEventListener("click", cycleWidth);
  });

  const formatRemaining = ratio => {
    if (!Number.isFinite(readingMinutes) || readingMinutes <= 0) return null;
    const remaining = Math.max(0, Math.round(readingMinutes * (1 - ratio)));
    if (remaining <= 0) return "Lecture terminée";
    if (remaining < 60) return `≈ ${remaining} min restantes`;
    const hours = Math.floor(remaining / 60);
    const rest = remaining % 60;
    return rest ? `≈ ${hours} h ${rest} restantes` : `≈ ${hours} h restantes`;
  };

  const persistScroll = (() => {
    if (!chapterSlug) return () => {};
    let timer = null;
    return ratio => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        write(`${storageKeyScrollPrefix}${chapterSlug}`, ratio.toFixed(4));
      }, 400);
    };
  })();

  const restoreScroll = () => {
    if (!chapterSlug) return;
    const raw = read(`${storageKeyScrollPrefix}${chapterSlug}`, null);
    if (raw === null) return;
    const ratio = Number.parseFloat(raw);
    if (!Number.isFinite(ratio) || ratio <= 0.01) return;
    requestAnimationFrame(() => {
      const scrollable = root.scrollHeight - root.clientHeight;
      if (scrollable > 0) {
        window.scrollTo({ top: scrollable * ratio, behavior: "instant" in window ? "auto" : "auto" });
      }
    });
  };

  if (progress && progressBar) {
    let ticking = false;

    const updateProgress = () => {
      const scrollable = root.scrollHeight - root.clientHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
      const clampedRatio = Math.min(1, Math.max(0, ratio));
      const percent = Math.round(clampedRatio * 100);
      progressBar.style.transform = `scaleX(${clampedRatio.toFixed(4)})`;
      progress.setAttribute("aria-valuenow", String(percent));
      const remainingLabel = formatRemaining(clampedRatio);
      const valueText = remainingLabel ? `${percent} % — ${remainingLabel}` : `${percent} %`;
      progress.setAttribute("aria-valuetext", valueText);
      progress.setAttribute("title", valueText);
      persistScroll(clampedRatio);
      ticking = false;
    };

    updateReadingProgress = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateProgress);
        ticking = true;
      }
    };

    window.addEventListener("scroll", updateReadingProgress, { passive: true });
    window.addEventListener("resize", updateReadingProgress);
  }

  const navigateTo = selector => {
    const link = document.querySelector(selector);
    if (link instanceof HTMLAnchorElement && !link.classList.contains("disabled")) {
      window.location.href = link.href;
    }
  };

  const isTypingTarget = target => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };

  document.addEventListener("keydown", event => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    switch (event.key) {
      case "ArrowLeft":
        navigateTo(".chapter-nav a.prev");
        break;
      case "ArrowRight":
        navigateTo(".chapter-nav a.next");
        break;
      case "+":
      case "=":
        scale = clamp(scale + step);
        applyScale();
        break;
      case "-":
      case "_":
        scale = clamp(scale - step);
        applyScale();
        break;
      case "0":
        scale = 1;
        applyScale();
        break;
      case "t":
      case "T":
        if (event.shiftKey) cycleTheme();
        else toggleNight();
        break;
      case "w":
      case "W":
        cycleWidth();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  applyScale();
  applyWidth();
  applyTheme();
  restoreScroll();
  updateReadingProgress();
})();
