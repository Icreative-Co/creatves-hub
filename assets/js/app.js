// Utility: Debounce function
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Utility: Fetch with retry and caching
const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
  const cacheKey = `movies_data_${url}`;
  const cacheTimestampKey = `${cacheKey}_timestamp`;
  const cacheDuration = 60 * 60 * 1000; // 1 hour

  // Check cache
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

  // Fetch with retry
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
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
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Navbar functionality
const initNavbar = () => {
  const hamburger = document.querySelector(".hamburger");
  const navList = document.querySelector(".nav-list");
  const closeBtn = document.querySelector(".nav-list .close");
  const navLinks = document.querySelectorAll(".nav-list li a");

  if (!hamburger || !navList || !closeBtn) {
    console.error("Navbar elements missing");
    return;
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
};

// Carousel functionality with Swiper
const setupCarousel = (carouselId, items) => {
  const carousel = document.querySelector(carouselId);
  if (!carousel) {
    console.error(`Carousel ${carouselId} not found`);
    return;
  }

  const wrapper = carousel.querySelector(".swiper-wrapper");
  wrapper.innerHTML = items.length
    ? items.map(item => `
        <div class="swiper-slide">
          <div class="card">
            <div class="img">
              <a href="movie-detail.html?file=${encodeURIComponent(item.file_path)}">
                <img src="${DOMPurify.sanitize(item.poster || '/assets/images/logo2.svg')}" alt="${DOMPurify.sanitize(item.title || 'No title')}" loading="lazy" onerror="this.src='/assets/images/logo2.svg'">
              </a>
            </div>
            <div class="title">
              <a href="movie-detail.html?file=${encodeURIComponent(item.file_path)}"><h4>${DOMPurify.sanitize(item.title || 'Untitled')}</h4></a>
              <span>${DOMPurify.sanitize(item.year || 'N/A')}</span>
            </div>
            <div class="footer">
              <span>${DOMPurify.sanitize(item.resolution || 'N/A')}</span>
              <div class="time-rating">
                <span><i class="fa-regular fa-clock"></i> ${DOMPurify.sanitize(item.duration || 'N/A')}</span>
                <span><i class="fa-solid fa-star"></i> ${DOMPurify.sanitize(item.rating || 'N/A')}</span>
              </div>
            </div>
          </div>
        </div>
      `).join("")
    : "<div class='swiper-slide'><p>No content available. Please try again later.</p></div>";

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
    loop: items.length > 4,
    a11y: {
      enabled: true,
      prevSlideMessage: "<",
      nextSlideMessage: ">",
    },
  });
};

// Filter functionality
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

// Load content for carousels
const loadContent = async () => {
  const carousels = {
    movies: { id: ".movies-carousel", category: "movie" },
    series: { id: ".series-carousel", category: "tv-series" },
    music: { id: ".music-carousel", category: "music" },
  };

  const baseUrl = window.location.origin;
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
  } catch (error) {
    console.error("Failed to load content:", error);
    Object.values(carousels).forEach(({ id }) => {
      const wrapper = document.querySelector(`${id} .swiper-wrapper`);
      if (wrapper) {
        wrapper.innerHTML = "<div class='swiper-slide'><p>Failed to load content. Please try again later.</p></div>";
      }
    });
  }
};

// Movie detail page
const loadMovieDetail = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const filePath = urlParams.get("file");
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
  };

  if (!filePath || !videoPopup || !videoPlayer || !videoSource || !watchNowBtn || !closePopupBtn || !Object.values(elements).every(el => el)) {
    console.error("Missing required elements for movie detail page");
    if (elements.title) {
      elements.title.textContent = "Error: Page setup incomplete.";
      elements.description && (elements.description.textContent = "Please check the page configuration.");
    }
    return;
  }

  const baseUrl = window.location.origin;

  try {
    const data = await fetchWithRetry(`${baseUrl}/assets/data/movies.json`);
    if (!Array.isArray(data)) {
      throw new Error("Invalid data format: Expected an array");
    }
    const movie = data.find(item => item.file_path === decodeURIComponent(filePath));

    if (movie) {
      elements.poster.src = DOMPurify.sanitize(movie.poster || "/assets/images/logo2.svg");
      elements.poster.alt = DOMPurify.sanitize(movie.title || "No title");
      elements.title.textContent = DOMPurify.sanitize(movie.title || "Untitled");
      elements.episodes.textContent = movie.category === "tv-series" ? "Series" : "";
      elements.rating.textContent = DOMPurify.sanitize(movie.rating || "N/A");
      elements.resolution.textContent = DOMPurify.sanitize(movie.resolution || "HD");
      elements.genres.innerHTML = movie.genres?.map(g => `<a href="#">${DOMPurify.sanitize(g)}</a>`).join(", ") || "N/A";
      elements.year.textContent = DOMPurify.sanitize(movie.year || "Unknown");
      elements.duration.textContent = DOMPurify.sanitize(movie.duration || "N/A");
      elements.description.textContent = DOMPurify.sanitize(movie.description || "No description available.");
      elements.download.href = DOMPurify.sanitize(movie.file_path || "#");

      const showVideo = () => {
        videoSource.src = DOMPurify.sanitize(movie.file_path || "/assets/video/fallback.mp4");
        videoPlayer.load();
        videoPopup.hidden = false;
        videoPlayer.focus();
        videoPlayer.play().catch(() => console.warn("Autoplay prevented by browser"));
      };

      watchNowBtn.addEventListener("click", showVideo);

      closePopupBtn.addEventListener("click", () => {
        videoPopup.hidden = true;
        videoPlayer.pause();
        videoSource.src = "";
        videoPlayer.load();
        watchNowBtn.focus();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !videoPopup.hidden) {
          videoPopup.hidden = true;
          videoPlayer.pause();
          videoSource.src = "";
          videoPlayer.load();
          watchNowBtn.focus();
        }
      });
    } else {
      elements.title.textContent = "Movie not found.";
      elements.description.textContent = "The requested content could not be found.";
    }
  } catch (error) {
    console.error("Failed to load movie data:", error);
    elements.title.textContent = "Error loading movie details.";
    elements.description.textContent = "Unable to load content. Please try again later.";
  }
};

// Back to top
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

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initNavbar();
  initBackToTop();
  if (document.querySelector("#movie-detail")) {
    loadMovieDetail();
  } else {
    loadContent();
  }
});
