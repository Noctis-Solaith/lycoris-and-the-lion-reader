(() => {
  const root = document.documentElement;
  const storageKeyTheme = "roman-reader-theme";
  const storageKeyScale = "roman-reader-scale";
  const minScale = 0.9;
  const maxScale = 1.22;
  const step = 0.06;

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
  const themes = ["paper", "night", "lycoris", "lion"];
  let scale = clamp(Number.parseFloat(read(storageKeyScale, "1")) || 1);
  let theme = read(storageKeyTheme, "paper");
  if (!themes.includes(theme)) {
    theme = "paper";
  }

  const buttons = {
    decrease: document.querySelectorAll("[data-font-decrease]"),
    reset: document.querySelectorAll("[data-font-reset]"),
    increase: document.querySelectorAll("[data-font-increase]")
  };
  const themeSelects = document.querySelectorAll("[data-theme-select]");
  const themeToggles = document.querySelectorAll("[data-theme-toggle]");
  const progress = document.querySelector("[data-reading-progress]");
  const progressBar = progress?.querySelector("[data-reading-progress-bar]");
  let updateReadingProgress = () => {};

  const applyScale = () => {
    root.style.setProperty("--reader-scale", scale.toFixed(2));
    write(storageKeyScale, scale.toFixed(2));
    updateReadingProgress();
  };

  const applyTheme = () => {
    root.dataset.theme = theme;
    write(storageKeyTheme, theme);
    themeSelects.forEach(select => {
      select.value = theme;
    });
    themeToggles.forEach(button => {
      const isNight = theme === "night";
      button.textContent = isNight ? "☀" : "☾";
      button.setAttribute("aria-pressed", String(isNight));
      button.setAttribute("title", isNight ? "Passer au thème clair" : "Passer au thème nuit");
      button.setAttribute("aria-label", isNight ? "Passer au thème clair" : "Passer au thème nuit");
    });
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
    button.addEventListener("click", () => {
      theme = theme === "night" ? "paper" : "night";
      applyTheme();
    });
  });

  if (progress && progressBar) {
    let ticking = false;

    const updateProgress = () => {
      const scrollable = root.scrollHeight - root.clientHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
      const clampedRatio = Math.min(1, Math.max(0, ratio));
      const percent = Math.round(clampedRatio * 100);
      progressBar.style.transform = `scaleX(${clampedRatio.toFixed(4)})`;
      progress.setAttribute("aria-valuenow", String(percent));
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
    updateReadingProgress();
  }

  applyScale();
  applyTheme();
})();
