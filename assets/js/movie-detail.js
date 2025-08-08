// assets/js/script.js
document.addEventListener("DOMContentLoaded", () => {
 // Delay to ensure DOM is fully rendered
 setTimeout(loadMovies, 100);
});

async function loadMovies() {
 const carousels = {
 upcoming: document.querySelector("#upcoming-movies"),
 music: document.querySelector("#music-tracks"),
 tvSeries: document.querySelector("#tv-series"),
 };

 console.log("Carousels found:", {
 upcoming: !!carousels.upcoming,
 music: !!carousels.music,
 tvSeries: !!carousels.tvSeries,
 });

 Object.entries(carousels).forEach(([key, carousel]) => {
 if (carousel) {
 carousel.innerHTML = `<li>Loading ${key === "upcoming" ? "movies" : key === "music" ? "music tracks" : "TV series"}...</li>`;
 }
 });

 try {
 const response = await fetch("/assets/data/movies.json");
 if (!response.ok) throw new Error(`Failed to fetch data: ${response.status}`);
 const data = await response.json();
 console.log("Data loaded:", data);

 Object.values(carousels).forEach(carousel => {
 if (carousel) carousel.innerHTML = "";
 });

 let hasTvSeries = false;
 data.forEach(item => {
 const card = `
 <li class="card">
 <div class="img">
 <a href="${item.file_path ? `movie-detail.html?file=${encodeURIComponent(item.file_path)}` : '#'}" aria-label="Watch ${item.title}">
 <img src="${item.poster || '/assets/images/logo2.svg'}" alt="${item.title}" loading="lazy">
 </a>
 </div>
 <div class="title">
 <a href="${item.file_path ? `movie-detail.html?file=${encodeURIComponent(item.file_path)}` : '#'}" aria-label="Watch ${item.title}"><h4>${item.title}</h4></a>
 <span>${item.year || 'N/A'}</span>
 </div>
 <div class="footer">
 <span>${item.resolution || 'N/A'}</span>
 <div class="time-rating">
 <span><i class="fa-regular fa-clock"></i> ${item.duration || 'N/A'}</span>
 <span><i class="fa-solid fa-star"></i> ${item.rating || 'N/A'}</span>
 </div>
 </div>
 </li>
 `;

 if (item.category === "movie" && carousels.upcoming) {
 carousels.upcoming.insertAdjacentHTML("beforeend", card);
 } else if (item.category === "music" && carousels.music) {
 carousels.music.insertAdjacentHTML("beforeend", card);
 } else if (item.category === "tv-series" && carousels.tvSeries) {
 carousels.tvSeries.insertAdjacentHTML("beforeend", card);
 hasTvSeries = true;
 }
 });

 if (carousels.tvSeries && !hasTvSeries) {
 carousels.tvSeries.innerHTML = "<li>No TV series available.</li>";
 }

 console.log("Carousel items:", {
 upcoming: carousels.upcoming?.children.length || 0,
 music: carousels.music?.children.length || 0,
 tvSeries: carousels.tvSeries?.children.length || 0,
 });

 Object.entries(carousels).forEach(([key, carousel]) => {
 if (carousel && carousel.children.length > 0 && !carousel.innerHTML.includes("No TV series")) {
 console.log(`Setting up carousel: ${key} (ID: ${carousel.id})`);
 setupCarousel(carousel);
 } else {
 console.warn(`Skipping carousel setup for ${key}: No valid items or element missing`);
 }
 });
 } catch (error) {
 console.error("Error loading content:", error);
 Object.entries(carousels).forEach(([key, carousel]) => {
 if (carousel) {
 carousel.innerHTML = `<li>Failed to load ${key === "upcoming" ? "movies" : key === "music" ? "music tracks" : "TV series"}.</li>`;
 }
 });
 }
}

function setupCarousel(carousel) {
 if (!carousel) {
 console.warn("Carousel element is null or undefined");
 return;
 }

 // Ensure wrapper exists, create if missing
 let wrapper = carousel.closest(".wrapper");
 if (!wrapper) {
 console.warn(`Wrapper not found for carousel: ${carousel.id}, creating one`);
 wrapper = document.createElement("div");
 wrapper.className = "wrapper";
 carousel.parentElement.insertBefore(wrapper, carousel);
 wrapper.appendChild(carousel);
 wrapper.insertAdjacentHTML("afterbegin", '<button class="carousel-btn prev" aria-label="Previous"><i class="fa-solid fa-chevron-left"></i></button>');
 wrapper.insertAdjacentHTML("beforeend", '<button class="carousel-btn next" aria-label="Next"><i class="fa-solid fa-chevron-right"></i></button>');
 }

 const firstCard = carousel.querySelector(".card");
 if (!firstCard) {
 console.warn(`No cards found in carousel: ${carousel.id}`);
 return;
 }
 const firstCardWidth = firstCard.offsetWidth;
 const cardPerView = Math.round(carousel.offsetWidth / firstCardWidth);
 const children = [...carousel.children];

 if (children.length < cardPerView) {
 console.log(`Not enough items for infinite scroll in ${carousel.id}`);
 return;
 }

 children.slice(-cardPerView).reverse().forEach(card => {
 carousel.insertAdjacentHTML("afterbegin", card.outerHTML);
 });
 children.slice(0, cardPerView).forEach(card => {
 carousel.insertAdjacentHTML("beforeend", card.outerHTML);
 });

 carousel.classList.add("no-transition");
 carousel.scrollLeft = carousel.offsetWidth;
 carousel.classList.remove("no-transition");

 let isDragging = false,
 startX,
 startScrollLeft,
 timeoutId;

 const dragStart = e => {
 isDragging = true;
 carousel.classList.add("dragging");
 startX = e.pageX;
 startScrollLeft = carousel.scrollLeft;
 };

 const dragging = e => {
 if (!isDragging) return;
 carousel.scrollLeft = startScrollLeft - (e.pageX - startX);
 };

 const dragStop = () => {
 isDragging = false;
 carousel.classList.remove("dragging");
 };

 const infiniteScroll = () => {
 if (carousel.scrollLeft === 0) {
 carousel.classList.add("no-transition");
 carousel.scrollLeft = carousel.scrollWidth - 2 * carousel.offsetWidth;
 carousel.classList.remove("no-transition");
 } else if (Math.ceil(carousel.scrollLeft) === carousel.scrollWidth - carousel.offsetWidth) {
 carousel.classList.add("no-transition");
 carousel.scrollLeft = carousel.offsetWidth;
 carousel.classList.remove("no-transition");
 }
 clearTimeout(timeoutId);
 if (!wrapper.matches(":hover") && children.length > 0) autoPlay();
 };

 const autoPlay = () => {
 if (window.innerWidth < 800 || !children.length) return;
 timeoutId = setTimeout(() => (carousel.scrollLeft += firstCardWidth), 2500);
 };

 if (children.length > 0) autoPlay();

 carousel.addEventListener("mousedown", dragStart);
 carousel.addEventListener("mousemove", dragging);
 document.addEventListener("mouseup", dragStop);
 carousel.addEventListener("scroll", infiniteScroll);
 wrapper.addEventListener("mouseenter", () => clearTimeout(timeoutId));
 wrapper.addEventListener("mouseleave", autoPlay);

 const prevBtn = wrapper.querySelector(".carousel-btn.prev");
 const nextBtn = wrapper.querySelector(".carousel-btn.next");

 if (prevBtn && nextBtn) {
 prevBtn.addEventListener("click", () => {
 carousel.scrollLeft -= firstCardWidth;
 });
 nextBtn.addEventListener("click", () => {
 carousel.scrollLeft += firstCardWidth;
 });
 } else {
 console.warn(`Navigation buttons missing for carousel: ${carousel.id}`);
 }
}

const backBtn = document.querySelector(".back-to-top");
const scrollBtnDisplay = () => {
 backBtn.classList.toggle("show", window.scrollY > 100);
};
window.addEventListener("scroll", scrollBtnDisplay);

backBtn.addEventListener("click", () => {
 window.scrollTo({ top: 0, behavior: "smooth" });
});
