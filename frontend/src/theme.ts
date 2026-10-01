import { useEffect, useState } from 'react';
export type Theme = 'system' | 'light' | 'dark';
export function useTheme() {
  const [theme,setTheme] = useState<Theme>(() => {
    try { const value = localStorage.getItem('vocaro-theme'); if(value === 'light' || value === 'dark') return value; } catch { /* local storage is optional */ }
    return 'system';
  });
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;};
    apply(); media.addEventListener('change',apply);
    try {localStorage.setItem('vocaro-theme',theme);} catch { /* keep the selected theme in memory */ }
    return () => media.removeEventListener('change',apply);
  }, [theme]);
  return [theme,setTheme] as const;
}
