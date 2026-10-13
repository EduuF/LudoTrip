// Mouse e dedo pedem regras diferentes (dnd-kit, SortableJS `delayOnTouchOnly`): com o mouse, arrastar
// começa ao mover alguns pixels; com o dedo, segurar um instante (senão rouba a rolagem). Os textos
// ("clique" / "toque", "arraste" / "segure") seguem a entrada principal do aparelho.

export const isCoarse = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/** Quantos pixels o mouse anda antes de "levantar" (dnd-kit usa 5; SortableJS, 3 a 5). */
export const MOUSE_DISTANCE = 6
