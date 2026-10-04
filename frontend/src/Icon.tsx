import type { ButtonHTMLAttributes } from 'react';

export type SymbolName = 'note_add' | 'save' | 'folder_open' | 'undo' | 'content_copy' | 'download' | 'delete' | 'close' | 'check' | 'restart_alt' | 'arrow_forward' | 'code' | 'dark_mode' | 'light_mode' | 'brightness_auto' | 'add';

// Official Material Symbols Rounded, bundled locally as an SVG sprite.
export function Icon({name}: {name: SymbolName}) {
  return <svg className="material-symbol" width="24" height="24" aria-hidden="true" focusable="false"><use href={`${import.meta.env.BASE_URL}material-symbols.svg#${name}`}/></svg>;
}

export function IconButton({icon, label, className = '', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {icon: SymbolName; label: string}) {
  return <button {...props} type="button" className={`icon-button ${className}`} aria-label={label} title={label}><Icon name={icon}/></button>;
}
