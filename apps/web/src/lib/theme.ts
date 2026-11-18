/** The cookie that carries the chosen theme between visits (decision D4). */
export const THEME_COOKIE = "theme";

export type ThemeName = "light" | "dark";

export function themeFromCookie(value: string | undefined): ThemeName {
  return value === "dark" ? "dark" : "light";
}
