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

const fetchWithRetry = async (url, retries = 3, delay = 1000, options = {}) => {
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
  const headers = token ? { ...options.headers, 'Authorization': `Bearer ${token}` } : options.headers || {};
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, headers });
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

const initNavbar = () => {
  const hamburger = document.querySelector(".hamburger");
  const navList = document.querySelector(".nav-list");
  const closeBtn = document.querySelector(".nav-list .close");
  const navLinks = document.querySelectorAll(".nav-list li a, .nav-list a.btn");
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
      const isSamePage = href.startsWith("#");
      const target = isSamePage ? document.querySelector(href) : null;
      if (target) {
        window.scrollTo({
          top: target.offsetTop - (document.querySelector(".navbar")?.offsetHeight || 0),
          behavior: "smooth"
        });
        navList.classList.remove("active");
        hamburger.setAttribute("aria-expanded", "false");
      } else {
        window.location.href = href;
      }
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
  const validItems = items.filter(item => item.file_path || (item.seasons && item.seasons[0]?.episodes[0]?.file_path));
  console.log(`Carousel ${carouselId} items:`, validItems);

  wrapper.innerHTML = validItems.length
    ? validItems.map(item => {
        const filePath = item.file_path || (item.seasons && item.seasons[0]?.episodes[0]?.file_path) || '#';
        return `
        <div class="swiper-slide">
          <div class="card">
            <div class="img">
              <a href="movie-detail.html?file=${encodeURIComponent(filePath)}" aria-label="Watch ${DOMPurify.sanitize(item.title || 'No title')}">
                <img src="${DOMPurify.sanitize(item.poster || '/assets/images/logo2.svg')}" alt="${DOMPurify.sanitize(item.title || 'No title')}" loading="lazy" onerror="this.src='/assets/images/logo2.svg'">
              </a>
            </div>
            <div class="title">
              <a href="movie-detail.html?file=${encodeURIComponent(filePath)}" aria-label="Watch ${DOMPurify.sanitize(item.title || 'No title')}"><h4>${DOMPurify.sanitize(item.title || 'Untitled')}</h4></a>
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
    : "<div class='swiper-slide'><p>No content available. <a href='/login.html'>Log in</a> to try again.</p></div>";

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

const setupFilters = (carouselId, items) => {
  const carousel = document.querySelector(carouselId);
  if (!carousel) return;
  const section = carousel.closest('.carousel-section');
  if (!section) {
    console.warn(`Parent section not found for ${carouselId}`);
    return;
  }
  const buttons = section.querySelectorAll('.buttons button');
  if (!buttons.length) {
    console.warn(`No filter buttons found for ${carouselId}`);
    return;
  }
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const filter = button.getAttribute("data-filter");
      buttons.forEach(btn => btn.setAttribute("aria-pressed", btn === button ? "true" : "false"));
      const filteredItems = filter === "all"
        ? items
        : items.filter(item => item.genres?.includes(filter));
      setupCarousel(carouselId, filteredItems);
    });
  });
};

const loadHeroContent = async () => {
  const baseUrl = window.env?.API_BASE_URL || window.location.origin;
  try {
    const data = await fetchWithRetry(`${baseUrl}/assets/data/movies.json`);
    if (!Array.isArray(data)) {
      throw new Error("Invalid data format: Expected an array");
    }
    const highRated = data.filter(item => parseFloat(item.rating) >= 7.0);
    const featured = highRated[Math.floor(Math.random() * highRated.length)] || data[0];
    if (!featured) return;

    document.querySelector('.hero').style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), url(${DOMPurify.sanitize(featured.poster || '/assets/images/hero-bg.webp')})`;
    document.querySelector('#hero-category').textContent = DOMPurify.sanitize(featured.category.toUpperCase());
    document.querySelector('#hero-title').innerHTML = DOMPurify.sanitize(featured.title || 'Untitled');
    document.querySelector('#hero-rating').textContent = DOMPurify.sanitize(`Rating: ${featured.rating || 'N/A'}`);
    document.querySelector('#hero-resolution').textContent = DOMPurify.sanitize(featured.resolution || 'N/A');
    document.querySelector('#hero-genres').innerHTML = DOMPurify.sanitize(featured.genres?.map(g => `<a href="#">${g}</a>`).join(', ') || 'N/A');
    document.querySelector('#hero-year').innerHTML = `<i class="fa-solid fa-calendar-days"></i> ${DOMPurify.sanitize(featured.year || 'N/A')}`;
    document.querySelector('#hero-duration').innerHTML = `<i class="fa-regular fa-clock"></i> ${DOMPurify.sanitize(featured.duration || 'N/A')}`;
    document.querySelector('#hero-description').textContent = DOMPurify.sanitize(featured.description || 'No description available.');
    const watchBtn = document.querySelector('#hero-watch');
    watchBtn.onclick = () => {
      const filePath = featured.file_path || (featured.seasons && featured.seasons[0]?.episodes[0]?.file_path) || '#';
      window.location.href = `movie-detail.html?file=${encodeURIComponent(filePath)}`;
    };
  } catch (error) {
    console.error('Failed to load hero content:', error);
  }
};

const loadContent = async () => {
  const carousels = {
    movies: { id: ".movies-carousel", category: "movie" },
    series: { id: ".series-carousel", category: "tv-series" },
    music: { id: ".music-carousel", category: "music" },
  };

  Object.values(carousels).forEach(({ id }) => {
    const wrapper = document.querySelector(`${id} .swiper-wrapper`);
    if (wrapper) {
      wrapper.innerHTML = "<div class='swiper-slide'><p>Loading...</p></div>";
    }
  });

  const baseUrl = window.env?.API_BASE_URL || window.location.origin;
  try {
    const data = await fetchWithRetry(`${baseUrl}/assets/data/movies.json`);
    if (!Array.isArray(data)) {
      throw new Error("Invalid data format: Expected an array");
    }
    Object.entries(carousels).forEach(([key, { id, category }]) => {
      const items = data.filter(item => item.category === category);
      setupCarousel(id, items);
      setupFilters(id, items);
    });
    const featuredPosters = document.querySelectorAll('.featured-poster');
    if (featuredPosters.length) {
      const featured = data.filter(item => parseFloat(item.rating) >= 7.0).slice(0, 2);
      featuredPosters.forEach((poster, index) => {
        if (featured[index]) {
          poster.src = DOMPurify.sanitize(featured[index].poster || '/assets/images/service-banner.jpg');
          poster.alt = DOMPurify.sanitize(`Featured: ${featured[index].title}`);
        }
      });
    }
  } catch (error) {
    console.error("Failed to load content:", error);
    Object.values(carousels).forEach(({ id }) => {
      const wrapper = document.querySelector(`${id} .swiper-wrapper`);
      if (wrapper) {
        wrapper.innerHTML = "<div class='swiper-slide'><p>Failed to load content. <a href='/login.html'>Log in</a> to try again.</p></div>";
      }
    });
  }
};

const loadMovieDetail = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const filePath = urlParams.get("file");
  console.log("File path from URL:", filePath);

  const videoPopup = document.querySelector("#video-popup");
  const videoPlayer = document.querySelector("#video-player");
  const videoSource = document.querySelector("#video-source");
  const watchNowBtn = document.querySelector("#watch-now");
  const closePopupBtn = document.querySelector("#close-popup");

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

  if (!filePath || filePath === "undefined" || !videoPopup || !videoPlayer || !videoSource || !watchNowBtn || !closePopupBtn || !Object.values(elements).every(el => el)) {
    console.error("Invalid file path or missing required elements for movie detail page");
    if (elements.title) {
      elements.title.textContent = "Error: Invalid Content";
      elements.description && (elements.description.textContent = "No valid content selected. Please go back and select a movie or series.");
    }
    if (videoPopup) {
      videoPopup.setAttribute("hidden", "");
      console.log("Video popup hidden state (invalid setup):", videoPopup.hidden);
    }
    setTimeout(() => window.location.href = "/index.html", 3000);
    return;
  }

  videoPopup.setAttribute("hidden", "");
  console.log("Video popup hidden state (initial):", videoPopup.hidden);

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
      console.log("Video popup hidden state (movie not found):", videoPopup.hidden);
      setTimeout(() => window.location.href = "/index.html", 3000);
      return;
    }

    elements.poster.src = DOMPurify.sanitize(movie.poster || "/assets/images/logo2.svg");
    elements.poster.alt = DOMPurify.sanitize(movie.title || "No title");
    elements.title.textContent = DOMPurify.sanitize(movie.title || "Untitled");
    elements.rating.textContent = DOMPurify.sanitize(movie.rating || "N/A");
    elements.resolution.textContent = DOMPurify.sanitize(movie.resolution || "N/A");
    elements.year.textContent = DOMPurify.sanitize(movie.year || "Unknown");
    elements.description.textContent = DOMPurify.sanitize(movie.description || "No description available.");
    elements.genres.innerHTML = movie.genres?.map(g => `<a href="#" aria-label="Filter by ${DOMPurify.sanitize(g)}">${DOMPurify.sanitize(g)}</a>`).join(", ") || "N/A";

    const showVideo = () => {
      console.log("showVideo called");
      videoPopup.removeAttribute("hidden");
      videoPlayer.play().catch(() => console.warn("Autoplay prevented by browser"));
      videoPlayer.focus();
      console.log("Video popup hidden state (after showVideo):", videoPopup.hidden);
    };

    if (movie.category === "tv-series" && movie.seasons) {
      elements.seasonEpisodeSelection.removeAttribute("hidden");
      elements.episodes.textContent = `Series • ${movie.seasons.length} Season${movie.seasons.length > 1 ? "s" : ""}`;

      elements.seasonSelect.innerHTML = movie.seasons.map(s => 
        `<option value="${s.season}">Season ${s.season}</option>`
      ).join("");

      const updateEpisodes = () => {
        const selectedSeason = parseInt(elements.seasonSelect.value);
        const season = movie.seasons.find(s => s.season === selectedSeason);
        elements.episodeSelect.innerHTML = season.episodes.map(ep => 
          `<option value="${ep.episode}" data-file="${DOMPurify.sanitize(ep.file_path)}">${DOMPurify.sanitize(ep.title)} (Ep ${ep.episode})</option>`
        ).join("");
        const firstEpisode = season.episodes[0];
        videoSource.src = DOMPurify.sanitize(firstEpisode.file_path);
        elements.duration.textContent = DOMPurify.sanitize(firstEpisode.duration || "N/A");
        elements.download.href = DOMPurify.sanitize(firstEpisode.file_path);
        videoPlayer.load();
      };

      updateEpisodes();

      elements.seasonSelect.addEventListener("change", updateEpisodes);
      elements.episodeSelect.addEventListener("change", () => {
        const selectedOption = elements.episodeSelect.options[elements.episodeSelect.selectedIndex];
        const filePath = selectedOption.dataset.file;
        videoSource.src = DOMPurify.sanitize(filePath);
        elements.duration.textContent = DOMPurify.sanitize(
          movie.seasons
            .find(s => s.season === parseInt(elements.seasonSelect.value))
            .episodes.find(ep => ep.episode === parseInt(elements.episodeSelect.value)).duration || "N/A"
        );
        elements.download.href = DOMPurify.sanitize(filePath);
        videoPlayer.load();
      });

      watchNowBtn.addEventListener("click", showVideo);
    } else {
      elements.seasonEpisodeSelection.setAttribute("hidden", "");
      elements.episodes.textContent = movie.category === "movie" ? "Movie" : movie.category === "music" ? "Music" : "Series";
      videoSource.src = DOMPurify.sanitize(movie.file_path || window.env?.FALLBACK_VIDEO_PATH || "/assets/video/fallback.mp4");
      elements.duration.textContent = DOMPurify.sanitize(movie.duration || "N/A");
      elements.download.href = DOMPurify.sanitize(movie.file_path || "#");
      videoPlayer.load();
      watchNowBtn.addEventListener("click", showVideo);
    }

    closePopupBtn.addEventListener("click", () => {
      videoPopup.setAttribute("hidden", "");
      videoPlayer.pause();
      videoSource.src = "";
      videoPlayer.load();
      watchNowBtn.focus();
      console.log("Video popup hidden state (close):", videoPopup.hidden);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !videoPopup.hidden) {
        videoPopup.setAttribute("hidden", "");
        videoPlayer.pause();
        videoSource.src = "";
        videoPlayer.load();
        watchNowBtn.focus();
        console.log("Video popup hidden state (escape):", videoPopup.hidden);
      }
    });
  } catch (error) {
    console.error("Failed to load movie data:", error);
    elements.title.textContent = "Error loading movie details.";
    elements.description.textContent = "Unable to load content. Please try again later.";
    videoPopup.setAttribute("hidden", "");
    console.log("Video popup hidden state (error):", videoPopup.hidden);
    setTimeout(() => window.location.href = "/index.html", 3000);
  }
};

const initTrialForm = () => {
  const trialForm = document.querySelector('.trial-form');
  if (!trialForm) {
    console.warn('Trial form not found');
    return;
  }

  trialForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = DOMPurify.sanitize(trialForm.querySelector('#email').value);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const error = document.querySelector('#trial-error');
      error.textContent = 'Please enter a valid email address';
      error.classList.remove('hidden');
      setTimeout(() => error.classList.add('hidden'), 3000);
      return;
    }
    console.log('Trial form submitted with email:', email);
    alert('Email submitted: ' + email);
  });
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
  initTrialForm();
  if (document.querySelector("#movie-detail")) {
    loadMovieDetail();
  } else {
    loadContent();
    loadHeroContent();
  }
});