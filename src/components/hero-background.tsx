"use client";

import { useEffect, useState } from "react";

const slides = [
  "/farmsave-homepage.png",
  "/hero-farmers.png",
  "/hero-transporters.png",
  "/hero-coordinators.webp",
  "/hero-agricultural-partners.webp",
  "/hero-buyers.webp"
];

const transitionMs = 3000;
const slideHoldMs = 3000;

export function HeroBackground() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const nextIndex = (activeIndex + 1) % slides.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let finishTimer: number | undefined;
    let interval: number | undefined;
    const beginTransition = () => {
      setTransitioning(true);
      finishTimer = window.setTimeout(() => {
        setActiveIndex(index => (index + 1) % slides.length);
        setTransitioning(false);
      }, transitionMs);
    };

    const firstTransition = window.setTimeout(() => {
      beginTransition();
      interval = window.setInterval(beginTransition, transitionMs + slideHoldMs);
    }, slideHoldMs);

    return () => {
      window.clearTimeout(firstTransition);
      if (interval !== undefined) window.clearInterval(interval);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, []);

  const background = (src: string) => ({
    backgroundImage: `linear-gradient(90deg, rgb(15 23 42 / 88%) 0%, rgb(15 23 42 / 70%) 43%, rgb(15 23 42 / 30%) 100%), url("${src}")`
  });

  return <div className="home-hero-background" aria-hidden="true">
    <div className={`home-hero-slide home-hero-slide-current${transitioning ? " is-leaving" : ""}`} style={background(slides[activeIndex])} />
    <div className={`home-hero-slide home-hero-slide-next${transitioning ? " is-entering" : ""}`} style={background(slides[nextIndex])} />
  </div>;
}
