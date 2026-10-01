import { useEffect } from "react";

export const APP_NAME = "Workforce Management";

/** Sets the browser tab title: "<title> · <suffix>" (suffix defaults to the product name). */
export function usePageTitle(title: string | undefined, suffix: string = APP_NAME) {
  useEffect(() => {
    document.title = title ? `${title} · ${suffix}` : suffix;
  }, [title, suffix]);
}
