import { createElement, CSSProperties, HTMLElementType, ReactNode, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function AnimateIn({
  children,
  delay = 0,
  duration = 500,
  className = "",
  from,
  to,
  style,
  as = "div",
}: {
  from: string;
  to: string;
  children?: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
  as?: HTMLElementType;
}) {
  const [animate, setAnimate] = useState(from);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const mediaQueryChangeHandler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", mediaQueryChangeHandler);

    return () => {
      mediaQuery.removeEventListener("change", mediaQueryChangeHandler);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      // If the user prefers reduced motion, skip the animation
      setAnimate(to);
      return;
    }

    const timer = setTimeout(() => {
      setAnimate(to);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, to, prefersReducedMotion]);

  return createElement(
    as,
    {
      className: cn("transition-all ease-in-out", className, animate),
      style: { transitionDuration: prefersReducedMotion ? "0ms" : `${duration}ms`, ...style },
    },
    children,
  );
}
