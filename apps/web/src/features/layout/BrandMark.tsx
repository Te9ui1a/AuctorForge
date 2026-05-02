type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className={compact ? 'brand-mark brand-mark--compact' : 'brand-mark'} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="brand-mark-icon" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 4.5h7.2a3.8 3.8 0 0 1 3.8 3.8v9.9H10.8A3.8 3.8 0 0 0 7 22V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M7 4.5H5.8A2.8 2.8 0 0 0 3 7.3V18a2.5 2.5 0 0 0 2.5 2.5H7" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M10 8h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M10 11.3h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    </div>
  );
}
