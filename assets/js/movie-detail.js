const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const getToken = () => localStorage.getItem('jwt_token');

const handleUnauthorized = () => {
  localStorage.removeItem('jwt_token');
  window.location.href = '/login.html';
};

const isTokenValid = () => {
  const token = getToken();
  if (!token) return false;
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) throw new Error('Invalid JWT format');
    const payload = JSON.parse(atob(payloadBase64));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now && payload.username;
  } catch (error) {
    console.warn('Invalid token format:', error);
    return false;
  }
};

const getUsernameFromToken = () => {
  const token = getToken();
  if (!token) return null;
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const payload = JSON.parse(atob(payloadBase64));
    return payload.username || null;
  } catch (error) {
    console.warn('Failed to parse username from token:', error);
    return null;
  }
};

const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
  const cacheKey = `movies_data_${url}`;
  const cacheTimestampKey = `${cacheKey}_timestamp`;
  const cacheDuration = parseInt(window.env?.CACHE_DURATION) || 60 * 60 * 1000;

  const cached = localStorage.getItem(cacheKey);
  const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
  const now = Date.now();

  if (cached && cachedTimestamp && now - parseInt(cachedTimestamp) < cacheDuration) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.warn("Invalid cached data, fetching fresh:", error);
    }
  }

  const token = getToken();
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers });
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error('Unauthorized: Redirecting to login');
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(cacheTimestampKey, now.toString());
      } catch (error) {
        console.warn("Failed to cache data:", error);
      }
      return data;
    } catch (error) {
      console.error(`Fetch attempt ${i + 1} failed for ${url}:`, error);
      if (i === retries - 1 || error.message.includes('Unauthorized')) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

const transcodeMkvToMp4 = async (filePath) => {
  try {
    if (!ffmpeg.isLoaded()) await ffmpeg.load();
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Failed to fetch ${filePath}: ${response.statusText}`);
    const mkvData = await response.arrayBuffer();
    ffmpeg.FS('writeFile', 'input.mkv', await fetchFile(mkvData));
    await ffmpeg.run('-i', 'input.mkv', '-c:v', 'copy', '-c:a', 'aac', '-f', 'mp4', 'output.mp4');
    const mp4Data = ffmpeg.FS('readFile', 'output.mp4');
    const blob = new Blob([mp4Data.buffer], { type: 'video/mp4' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('MKV transcoding failed:', error);
    return null;
  }
};

const initNavbar = () => {
  const hamburger = document.querySelector(".hamburger");
  const navList = document.querySelector(".nav-list");
  const closeBtn = document.querySelector(".nav-list .close");
  const navLinks = document.querySelectorAll(".nav-list li a");
  const dropdownToggle = document.querySelector(".dropdown-toggle");
  const dropdownMenu = document.querySelector(".dropdown-menu");
  const usernameSpan = document.querySelector("#username");
  const logoutBtn = document.querySelector("#logout");

  if (!hamburger || !navList || !closeBtn || !dropdownToggle || !dropdownMenu || !usernameSpan || !logoutBtn) {
    console.error("Navbar elements missing");
    return;
  }

  const username = getUsernameFromToken();
  if (username) {
    usernameSpan.textContent = DOMPurify.sanitize(username);
  }

  const manageMoviesLink = document.querySelector('a[href="/manage-movies.html"]');
  if (manageMoviesLink && username !== 'admin') {
    manageMoviesLink.style.display = 'none';
    console.log('Manage Movies link hidden for non-admin user:', username);
  }

  const toggleMenu = () => {
    const isOpen = navList.classList.toggle("active");
    hamburger.setAttribute("aria-expanded", isOpen);
    hamburger.focus();
  };

  hamburger.addEventListener("click", toggleMenu);
  hamburger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleMenu();
    }
  });

  closeBtn.addEventListener("click", () => {
    navList.classList.remove("active");
    hamburger.setAttribute("aria-expanded", "false");
    hamburger.focus();
  });

  dropdownToggle.addEventListener("click", () => {
    const isExpanded = dropdownMenu.classList.toggle("show");
    dropdownToggle.setAttribute("aria-expanded", isExpanded);
  });

  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const href = link.getAttribute("href");
      window.location.href = href;
    });
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('jwt_token');
    console.log('User logged out, redirecting to /login.html');
    window.location.href = '/login.html';
  });
};

const setupCarousel = (carouselId, items) => {
  const carousel = document.querySelector(carouselId);
  if (!carousel) {
    console.error(`Carousel ${carouselId} not found`);
    return;
  }

  const wrapper = carousel.querySelector(".swiper-wrapper");
  const validItems = items.filter(item => item.file_path || (item.episode && item.file_path));
  console.log(`Carousel ${carouselId} items:`, validItems);

  wrapper.innerHTML = validItems.length
    ? validItems.map(item => {
        const filePath = item.file_path;
        const title = item.episode ? `${item.title} (S${item.season}E${item.episode})` : item.title;
        const poster = item.poster || '/assets/images/logo2.svg';
        return `
        <div class="swiper-slide">
          <div class="card">
            <div class="img">
              <a href="movie-detail.html?file=${encodeURIComponent(filePath)}" aria-label="Watch ${DOMPurify.sanitize(title || 'No title')}">
                <img src="${DOMPurify.sanitize(poster)}" alt="${DOMPurify.sanitize(title || 'No title')}" loading="lazy" onerror="this.src='/assets/images/logo2.svg'">
              </a>
            </div>
            <div class="title">
              <a href="movie-detail.html?file=${encodeURIComponent(filePath)}" aria-label="Watch ${DOMPurify.sanitize(title || 'No title')}"><h4>${DOMPurify.sanitize(title || 'Untitled')}</h4></a>
              <span>${DOMPurify.sanitize(item.year || 'N/A')}</span>
            </div>
            <div class="footer">
              <span class="rating-badge">${DOMPurify.sanitize(item.rating || 'N/A')}</span>
              <div class="time-rating">
                <span><i class="fa-regular fa-clock"></i> ${DOMPurify.sanitize(item.duration || 'N/A')}</span>
              </div>
            </div>
            <div class="genres">${DOMPurify.sanitize(item.genres?.join(', ') || 'N/A')}</div>
          </div>
        </div>
      `;
      }).join("")
    : "<div class='swiper-slide'><p>No related content available.</p></div>";

  new Swiper(carousel, {
    slidesPerView: 1,
    spaceBetween: 10,
    navigation: {
      nextEl: `${carouselId} .swiper-button-next`,
      prevEl: `${carouselId} .swiper-button-prev`,
    },
    breakpoints: {
      640: { slidesPerView: 2 },
      768: { slidesPerView: 3 },
      1024: { slidesPerView: 4 },
    },
    autoplay: {
      delay: 2500,
      disableOnInteraction: true,
    },
    loop: validItems.length > 4,
    a11y: {
      enabled: true,
      prevSlideMessage: "Previous slide",
      nextSlideMessage: "Next slide",
    },
  });
};

const setupRelatedContent = async (currentMovie, filePath) => {
  const baseUrl = window.env?.API_BASE_URL || window.location.origin;
  try {
    const data = await fetchWithRetry(`${baseUrl}/assets/data/movies.json`);
    if (!Array.isArray(data)) {
      throw new Error("Invalid data format: Expected an array");
    }

    let relatedItems = [];
    let subtitleText = 'Explore';
    let titleText = 'Related Content';

    if (currentMovie.category === "tv-series" && currentMovie.seasons) {
      const season = currentMovie.seasons.find(s => s.episodes.some(ep => ep.file_path === decodeURIComponent(filePath)));
      if (season) {
        subtitleText = `Season ${season.season}`;
        titleText = currentMovie.title;
        relatedItems = season.episodes
          .filter(ep => ep.file_path !== decodeURIComponent(filePath))
          .map(ep => ({
            title: ep.title,
            file_path: ep.file_path,
            poster: currentMovie.poster,
            year: currentMovie.year,
            rating: currentMovie.rating,
            duration: ep.duration,
            genres: currentMovie.genres,
            season: season.season,
            episode: ep.episode
          }));
      }
    } else {
      relatedItems = data
        .filter(item => item.id !== currentMovie.id && item.genres.some(g => currentMovie.genres.includes(g)))
        .sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
        .slice(0, 8);
    }

    document.querySelector('#carousel-subtitle').textContent = subtitleText;
    document.querySelector('#carousel-title').textContent = titleText;
    setupCarousel('.related-carousel', relatedItems);
  } catch (error) {
    console.error("Failed to load related content:", error);
    const wrapper = document.querySelector('.related-carousel .swiper-wrapper');
    if (wrapper) {
      wrapper.innerHTML = "<div class='swiper-slide'><p>Failed to load related content.</p></div>";
    }
  }
};

const loadMovieDetail = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const filePath = urlParams.get("file");
  console.log("File path from URL:", filePath);

  const videoPopup = document.querySelector("#video-popup");
  const closePopupBtn = document.querySelector("#close-popup");
  const shareBtn = document.querySelector(".share-btn");
  const settingsBtn = document.querySelector("#settings-btn");
  const settingsMenu = document.querySelector(".settings-menu");
  const playbackSpeed = document.querySelector("#playback-speed");
  const volumeSlider = document.querySelector("#volume");
  const lockScreenBtn = document.querySelector("#lock-screen");
  const unlockScreenBtn = document.querySelector("#unlock-screen");
  const autoplayCheckbox = document.querySelector("#autoplay");
  const subtitlesSelect = document.querySelector("#subtitles");
  const watchNowBtn = document.querySelector("#watch-now");
  const mkvHelp = document.querySelector("#mkv-help");
  const filterBtn = document.querySelector(".filter-btn");
  const filterDropdown = document.querySelector("#filter-dropdown");

  const elements = {
    poster: document.querySelector("#movie-poster"),
    title: document.querySelector("#movie-title"),
    episodes: document.querySelector("#movie-episodes"),
    rating: document.querySelector("#movie-rating"),
    resolution: document.querySelector("#movie-resolution"),
    genres: document.querySelector("#movie-genres"),
    year: document.querySelector("#movie-year"),
    duration: document.querySelector("#movie-duration"),
    description: document.querySelector("#movie-description"),
    download: document.querySelector("#download-link"),
    seasonEpisodeSelection: document.querySelector("#season-episode-selection"),
    seasonSelect: document.querySelector("#season-select"),
    episodeSelect: document.querySelector("#episode-select"),
  };

  if (!filePath || filePath === "undefined" || !videoPopup || !closePopupBtn || !shareBtn || !settingsBtn || !settingsMenu || !playbackSpeed || !volumeSlider || !lockScreenBtn || !unlockScreenBtn || !autoplayCheckbox || !subtitlesSelect || !watchNowBtn || !mkvHelp || !filterBtn || !filterDropdown || !Object.values(elements).every(el => el)) {
    console.error("Invalid file path or missing required elements for movie detail page");
    if (elements.title) {
      elements.title.textContent = "Error: Invalid Content";
      elements.description && (elements.description.textContent = "No valid content selected. Please go back and select a movie or series.");
    }
    videoPopup.setAttribute("hidden", "");
    setTimeout(() => window.location.href = "/index.html", 3000);
    return;
  }

  videoPopup.setAttribute("hidden", "");
  console.log("Video popup hidden state (initial):", videoPopup.hidden);

  const videoPlayer = videojs('video-player', {
    controls: true,
    autoplay: false,
    preload: 'auto',
    fluid: true,
    responsive: true,
    controlBar: {
      volumePanel: false,
      playbackRateMenuButton: false,
      remainingTimeDisplay: false
    }
  });

  const baseUrl = window.env?.API_BASE_URL || window.location.origin;
  try {
    const data = await fetchWithRetry(`${baseUrl}/assets/data/movies.json`);
    if (!Array.isArray(data)) {
      throw new Error("Invalid data format: Expected an array");
    }

    const movie = data.find(item => 
      item.file_path === decodeURIComponent(filePath) || 
      (item.seasons && item.seasons.some(season => season.episodes.some(ep => ep.file_path === decodeURIComponent(filePath))))
    );

    if (!movie) {
      console.error("Movie not found for file path:", filePath);
      elements.title.textContent = "Movie not found.";
      elements.description.textContent = "The requested content could not be found.";
      videoPopup.setAttribute("hidden", "");
      setTimeout(() => window.location.href = "/index.html", 3000);
      return;
    }

    document.querySelector('.movie-detail').style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), url(${DOMPurify.sanitize(movie.poster || '/assets/images/movie-detail-bg.webp')})`;
    elements.poster.src = DOMPurify.sanitize(movie.poster || "/assets/images/logo2.svg");
    elements.poster.alt = DOMPurify.sanitize(movie.title || "No title");
    elements.title.textContent = DOMPurify.sanitize(movie.title || "Untitled");
    elements.rating.textContent = DOMPurify.sanitize(movie.rating || "N/A");
    elements.resolution.textContent = DOMPurify.sanitize(movie.resolution || "N/A");
    elements.year.textContent = DOMPurify.sanitize(movie.year || "Unknown");
    elements.description.textContent = DOMPurify.sanitize(movie.description || "No description available.");

    // Populate genre filter dropdown
    filterDropdown.innerHTML = movie.genres?.map(g => 
      `<li><a href="/movies.html?genre=${encodeURIComponent(g)}" aria-label="Filter by ${DOMPurify.sanitize(g)}">${DOMPurify.sanitize(g)}</a></li>`
    ).join("") || "<li>No genres available</li>";

    filterBtn.addEventListener("click", () => {
      const isExpanded = filterDropdown.classList.toggle("show");
      filterBtn.setAttribute("aria-expanded", isExpanded);
    });

    const showVideo = async () => {
      console.log("showVideo called");
      let videoSrc = filePath;
      if (filePath.endsWith('.mkv')) {
        elements.description.textContent = "Transcoding MKV file, please wait...";
        videoSrc = await transcodeMkvToMp4(filePath);
        if (!videoSrc) {
          console.warn("MKV transcoding failed");
          elements.description.textContent = "This video (.mkv) could not be transcoded. Please download and play using VLC.";
          elements.download.href = DOMPurify.sanitize(filePath);
          elements.download.removeAttribute("hidden");
          mkvHelp.removeAttribute("hidden");
          watchNowBtn.disabled = true;
          return;
        }
      }

      videoPlayer.src({ type: 'video/mp4', src: DOMPurify.sanitize(videoSrc) });
      videoPopup.removeAttribute("hidden");
      videoPlayer.play().catch(error => {
        console.warn("Playback error:", error);
        elements.description.textContent = "Failed to play video: " + error.message;
        videoPopup.setAttribute("hidden", "");
      });
      videoPlayer.focus();
      console.log("Video popup hidden state (after showVideo):", videoPopup.hidden);
    };

    shareBtn.addEventListener("click", () => {
      const shareUrl = window.location.href;
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert("Link copied to clipboard!");
      }).catch(err => {
        console.error("Failed to copy link:", err);
        alert("Failed to copy link. Please copy the URL manually.");
      });
    });

    settingsBtn.addEventListener("click", () => {
      settingsMenu.classList.toggle("active");
      console.log("Settings menu toggled, active:", settingsMenu.classList.contains("active"));
    });

    playbackSpeed.addEventListener("change", () => {
      videoPlayer.playbackRate(parseFloat(playbackSpeed.value));
      console.log("Playback speed set to:", playbackSpeed.value);
    });

    volumeSlider.addEventListener("input", () => {
      videoPlayer.volume(volumeSlider.value);
      console.log("Volume set to:", volumeSlider.value);
    });

    lockScreenBtn.addEventListener("click", () => {
      videoPlayer.controls(false);
      lockScreenBtn.hidden = true;
      unlockScreenBtn.hidden = false;
      console.log("Screen locked");
    });

    unlockScreenBtn.addEventListener("click", () => {
      videoPlayer.controls(true);
      lockScreenBtn.hidden = false;
      unlockScreenBtn.hidden = true;
      console.log("Screen unlocked");
    });

    autoplayCheckbox.addEventListener("change", () => {
      videoPlayer.autoplay(autoplayCheckbox.checked);
      console.log("Autoplay set to:", autoplayCheckbox.checked);
    });

    subtitlesSelect.addEventListener("change", () => {
      console.log("Subtitles set to:", subtitlesSelect.value);
      const tracks = videoPlayer.textTracks();
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = tracks[i].language === subtitlesSelect.value ? 'showing' : 'disabled';
      }
    });

    const isMkv = filePath.endsWith('.mkv');
    if (movie.category === "tv-series" && movie.seasons) {
      elements.seasonEpisodeSelection.removeAttribute("hidden");
      elements.episodes.textContent = `Series • ${movie.seasons.length} Season${movie.seasons.length > 1 ? "s" : ""}`;

      elements.seasonSelect.innerHTML = movie.seasons.map(s => 
        `<option value="${s.season}" ${s.episodes.some(ep => ep.file_path === decodeURIComponent(filePath)) ? 'selected' : ''}>Season ${s.season}</option>`
      ).join("");

      const updateEpisodes = async () => {
        const selectedSeason = parseInt(elements.seasonSelect.value);
        const season = movie.seasons.find(s => s.season === selectedSeason);
        if (!season) {
          console.error("Selected season not found:", selectedSeason);
          return;
        }
        elements.episodeSelect.innerHTML = season.episodes.map(ep => 
          `<option value="${ep.episode}" data-file="${DOMPurify.sanitize(ep.file_path)}" ${ep.file_path === decodeURIComponent(filePath) ? 'selected' : ''}>${DOMPurify.sanitize(ep.title)} (Ep ${ep.episode})</option>`
        ).join("");

        const selectedEpisode = season.episodes.find(ep => ep.file_path === decodeURIComponent(filePath)) || season.episodes[0];
        let videoSrc = selectedEpisode.file_path;
        if (selectedEpisode.file_path.endsWith('.mkv')) {
          elements.description.textContent = "Transcoding MKV file, please wait...";
          videoSrc = await transcodeMkvToMp4(selectedEpisode.file_path);
          if (!videoSrc) {
            console.warn("MKV transcoding failed");
            elements.description.textContent = "This episode (.mkv) could not be transcoded. Please download and play using VLC.";
            elements.download.href = DOMPurify.sanitize(selectedEpisode.file_path);
            elements.download.removeAttribute("hidden");
            mkvHelp.removeAttribute("hidden");
            watchNowBtn.disabled = true;
            return;
          }
        }

        videoPlayer.src({ type: 'video/mp4', src: DOMPurify.sanitize(videoSrc) });
        elements.duration.textContent = DOMPurify.sanitize(selectedEpisode.duration || "N/A");
        elements.download.href = DOMPurify.sanitize(selectedEpisode.file_path);
        videoPlayer.load();
        watchNowBtn.disabled = false;
      };

      updateEpisodes();

      elements.seasonSelect.addEventListener("change", updateEpisodes);
      elements.episodeSelect.addEventListener("change", async () => {
        const selectedOption = elements.episodeSelect.options[elements.episodeSelect.selectedIndex];
        const epFilePath = selectedOption.dataset.file;
        let videoSrc = epFilePath;
        if (epFilePath.endsWith('.mkv')) {
          elements.description.textContent = "Transcoding MKV file, please wait...";
          videoSrc = await transcodeMkvToMp4(epFilePath);
          if (!videoSrc) {
            console.warn("MKV transcoding failed");
            elements.description.textContent = "This episode (.mkv) could not be transcoded. Please download and play using VLC.";
            elements.download.href = DOMPurify.sanitize(epFilePath);
            elements.download.removeAttribute("hidden");
            mkvHelp.removeAttribute("hidden");
            watchNowBtn.disabled = true;
            return;
          }
        }

        videoPlayer.src({ type: 'video/mp4', src: DOMPurify.sanitize(videoSrc) });
        const selectedSeason = parseInt(elements.seasonSelect.value);
        const episodeData = movie.seasons
          .find(s => s.season === selectedSeason)
          .episodes.find(ep => ep.episode === parseInt(elements.episodeSelect.value));
        elements.duration.textContent = DOMPurify.sanitize(episodeData.duration || "N/A");
        elements.download.href = DOMPurify.sanitize(epFilePath);
        videoPlayer.load();
        watchNowBtn.disabled = false;
        window.history.replaceState(null, '', `movie-detail.html?file=${encodeURIComponent(epFilePath)}`);
      });

      watchNowBtn.addEventListener("click", showVideo);
    } else {
      elements.seasonEpisodeSelection.setAttribute("hidden", "");
      elements.episodes.textContent = movie.category === "movie" ? "Movie" : movie.category === "music" ? "Music" : "Series";
      let videoSrc = filePath;
      if (isMkv) {
        elements.description.textContent = "Transcoding MKV file, please wait...";
        videoSrc = await transcodeMkvToMp4(filePath);
        if (!videoSrc) {
          console.warn("MKV transcoding failed");
          elements.description.textContent = "This video (.mkv) could not be transcoded. Please download and play using VLC.";
          elements.download.href = DOMPurify.sanitize(filePath);
          elements.download.removeAttribute("hidden");
          mkvHelp.removeAttribute("hidden");
          watchNowBtn.disabled = true;
          return;
        }
      }

      videoPlayer.src({ type: 'video/mp4', src: DOMPurify.sanitize(videoSrc || window.env?.FALLBACK_VIDEO_PATH || "/assets/video/fallback.mp4") });
      videoPlayer.load();
      videoPlayer.on('error', (e) => {
        console.error("Video load error:", e);
        elements.description.textContent = "Failed to load video: The file may be corrupted or unsupported.";
        videoPlayer.src([]);
        watchNowBtn.disabled = true;
        elements.download.href = DOMPurify.sanitize(filePath);
        elements.download.removeAttribute("hidden");
        mkvHelp.removeAttribute("hidden");
      });
      elements.duration.textContent = DOMPurify.sanitize(movie.duration || "N/A");
      elements.download.href = DOMPurify.sanitize(filePath);
      watchNowBtn.disabled = false;
      watchNowBtn.addEventListener("click", showVideo);
    }

    closePopupBtn.addEventListener("click", () => {
      videoPopup.setAttribute("hidden", "");
      videoPlayer.pause();
      videoPlayer.src([]);
      watchNowBtn.focus();
      console.log("Video popup hidden state (close):", videoPopup.hidden);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !videoPopup.hidden) {
        videoPopup.setAttribute("hidden", "");
        videoPlayer.pause();
        videoPlayer.src([]);
        watchNowBtn.focus();
        console.log("Video popup hidden state (escape):", videoPopup.hidden);
      }
    });

    setupRelatedContent(movie, filePath);
  } catch (error) {
    console.error("Failed to load movie data:", error);
    elements.title.textContent = "Error loading movie details.";
    elements.description.textContent = "Unable to load content. Please try again later.";
    videoPopup.setAttribute("hidden", "");
    setTimeout(() => window.location.href = "/index.html", 3000);
  }
};

const initBackToTop = () => {
  const backBtn = document.querySelector(".back-to-top");
  if (!backBtn) {
    console.error("Back to top button missing");
    return;
  }

  const toggleBtn = debounce(() => {
    backBtn.classList.toggle("show", window.scrollY > 100);
  }, 100);

  window.addEventListener("scroll", toggleBtn);
  backBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
};

document.addEventListener("DOMContentLoaded", () => {
  if (!isTokenValid()) {
    handleUnauthorized();
    return;
  }

  initNavbar();
  initBackToTop();
  loadMovieDetail();
});