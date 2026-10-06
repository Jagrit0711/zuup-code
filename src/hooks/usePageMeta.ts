import { useEffect } from "react";
import { SITE_NAME } from "@/content/site";

/**
 * Per-page <title> and robots directive for this single-page app. index.html carries the landing
 * page's defaults; pages that should not be indexed (404, sign-in) pass `noindex`. Both are restored
 * on unmount so client-side navigation never leaves a stale value behind.
 */
export function usePageMeta({ title, noindex = false }: { title?: string; noindex?: boolean }) {
  useEffect(() => {
    const previousTitle = document.title;
    if (title) document.title = `${title} | ${SITE_NAME}`;

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = robots?.content ?? null;
    if (noindex) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex, follow";
    }

    return () => {
      document.title = previousTitle;
      if (!noindex || !robots) return;
      if (previousRobots === null) robots.remove();
      else robots.content = previousRobots;
    };
  }, [title, noindex]);
}
