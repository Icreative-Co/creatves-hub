// Utility: Debounce function for smooth scrolling
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Navbar functionality
const initNavbar = () => {
  const hamburger = document.querySelector(".hamburger");
  const navList = document.querySelector(".nav-list");
  const closeBtn = document.querySelector(".nav-list .close");
  const navLinks = document.querySelectorAll(".nav-list li a");

  // Check if required elements exist
  if (!hamburger || !navList || !closeBtn) {
    console.error("Navbar initialization failed: Missing elements (.hamburger, .nav-list, or .close)");
    return;
  }

  // Toggle menu for hamburger and keyboard accessibility
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

  // Close menu
  closeBtn.addEventListener("click", () => {
    navList.classList.remove("active");
    hamburger.setAttribute("aria-expanded", "false");
    hamburger.focus();
  });

  // Handle navigation links with smooth scrolling
  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const href = link.getAttribute("href");

      // Direct navigation for non-anchor links
      if (!href.startsWith("#")) {
        window.location.href = href;
        return;
      }

      // Smooth scrolling for anchor links
      const target = document.querySelector(href);
      if (target) {
        const navbar = document.querySelector(".navbar");
        const offset = navbar ? navbar.offsetHeight : 0;
        window.scrollTo({
          top: target.offsetTop - offset,
          behavior: "smooth"
        });
        navList.classList.remove("active");
        hamburger.setAttribute("aria-expanded", "false");
      } else {
        console.warn(`Target element for ${href} not found`);
      }
    });
  });
};

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  try {
    initNavbar();
  } catch (error) {
    console.error("Navbar initialization error:", error);
  }
});
