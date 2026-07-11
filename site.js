(() => {
  const slides = Array.from(document.querySelectorAll(".hero__slide"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const intro = () => {
    if (typeof gsap === "undefined") return;

    gsap.from(".hero__logo", {
      opacity: 0,
      y: 18,
      scale: 0.96,
      duration: 1.05,
      ease: "power3.out",
    });
    gsap.from([".hero__title", ".hero__lede", ".hero__actions"], {
      opacity: 0,
      y: 20,
      duration: 0.8,
      stagger: 0.1,
      delay: 0.2,
      ease: "power3.out",
    });
  };

  const startHeroSlideshow = () => {
    if (slides.length < 2 || reduceMotion) return;

    let index = 0;
    window.setInterval(() => {
      slides[index].classList.remove("is-active");
      index = (index + 1) % slides.length;
      slides[index].classList.add("is-active");
    }, 7000);
  };

  intro();
  startHeroSlideshow();
})();
