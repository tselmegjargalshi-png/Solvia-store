import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n/index.tsx';
import type { Img } from '../lib/types.ts';
import { Icon } from './Icon.tsx';
import { ProductImage } from './product.tsx';

/** Main image + thumbnails. Swipe on touch, arrow keys on the thumbnail list. */
export function ProductGallery({ images, name }: { images: Img[]; name: string }) {
  const t = useT();
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  useEffect(() => setI(0), [images.map((x) => x.url).join('|')]);
  const n = images.length;
  const go = (k: number) => setI(((k % n) + n) % n);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(i + 1);
    if (e.key === 'ArrowLeft') go(i - 1);
  };
  if (!n) return <ProductImage alt={name} eager />;
  const cur = images[Math.min(i, n - 1)];
  return (
    <div className="gallery">
      <div
        className="gallery__main"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
          touch.current = null;
        }}
      >
        <ProductImage src={cur.url} alt={cur.alt || name} eager sizes="(max-width: 900px) 100vw, 55vw" />
        {n > 1 && (
          <>
            <button className="gallery__nav gallery__nav--prev" onClick={() => go(i - 1)} aria-label={t('a11y.thumb', { n: ((i - 1 + n) % n) + 1 })}>
              <Icon name="chevronLeft" />
            </button>
            <button className="gallery__nav gallery__nav--next" onClick={() => go(i + 1)} aria-label={t('a11y.thumb', { n: ((i + 1) % n) + 1 })}>
              <Icon name="chevronRight" />
            </button>
            <p className="gallery__count" aria-live="polite">
              {t('product.imageOf', { n: i + 1, total: n })}
            </p>
          </>
        )}
        <span className="gallery__note">{t('product.illustration')}</span>
      </div>
      {n > 1 && (
        <ul className="gallery__thumbs" onKeyDown={onKey}>
          {images.map((img, k) => (
            <li key={img.url}>
              <button className={`gallery__thumb ${k === i ? 'is-active' : ''}`} onClick={() => setI(k)} aria-label={t('a11y.thumb', { n: k + 1 })} aria-current={k === i}>
                <ProductImage src={img.url} alt="" sizes="96px" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
