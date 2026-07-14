(() => {
  document.querySelectorAll("[data-book-event]").forEach((link) => {
    link.setAttribute("href", "/book");
  });
})();
