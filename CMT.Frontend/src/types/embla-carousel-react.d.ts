// Minimal type shim for 'embla-carousel-react' to satisfy TypeScript when the package or its types
// are not installed. Preferred fix: install the real package with `npm install embla-carousel-react`
// and remove this shim afterwards.

declare module 'embla-carousel-react' {
  import * as React from 'react';

  export type EmblaOptionsType = Record<string, any>;
  export type EmblaPluginType = any;

  export type EmblaApi = {
    scrollPrev: () => void;
    scrollNext: () => void;
    canScrollPrev: () => boolean;
    canScrollNext: () => boolean;
    on: (eventName: string, handler: (...args: any[]) => void) => void;
    off: (eventName: string, handler: (...args: any[]) => void) => void;
  } | null | undefined;

  // [carouselRefSetter, emblaApi]
  export type UseEmblaCarouselType = [
    (node: HTMLElement | null) => void,
    EmblaApi
  ];

  /**
   * Hook: useEmblaCarousel(options?, plugins?)
   * Returns [carouselRefSetter, emblaApi]
   */
  function useEmblaCarousel(options?: EmblaOptionsType, plugins?: EmblaPluginType): UseEmblaCarouselType;

  export default useEmblaCarousel;
}