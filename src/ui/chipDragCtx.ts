import { createContext, useContext } from 'react'
import type { MouseEvent as RMouseEvent, PointerEvent as RPointerEvent } from 'react'
import type { DayRef, ID } from '../engine'

// O contrato do arraste de atividades (chipDrag.tsx tem o provedor): tipos, contexto, hook e os
// manipuladores que cada chip espalha nos seus botões.

export type ChipItem =
  { kind: 'loose'; placeId: ID } | { kind: 'visit'; visitId: ID; placeId: ID; from: DayRef | null }

export interface ChipDrag {
  lifted: ChipItem | null
  down(e: RPointerEvent<HTMLElement>, item: ChipItem): void
  move(e: RPointerEvent<HTMLElement>): void
  up(e: RPointerEvent<HTMLElement>, item: ChipItem, onTap: () => void): void
  cancel(e: RPointerEvent<HTMLElement>): void
}

export const ChipDragCtx = createContext<ChipDrag | null>(null)
export const useChipDrag = () => useContext(ChipDragCtx)

/** Os manipuladores de um chip: ponteiro para arrastar, clique de teclado para abrir. */
export function chipHandlers(drag: ChipDrag | null, item: ChipItem, onTap: () => void) {
  if (!drag) return { onClick: onTap }
  return {
    onPointerDown: (e: RPointerEvent<HTMLElement>) => drag.down(e, item),
    onPointerMove: drag.move,
    onPointerUp: (e: RPointerEvent<HTMLElement>) => drag.up(e, item, onTap),
    onPointerCancel: drag.cancel,
    // O toque e o clique já passam pelo ponteiro; o teclado (Enter, espaço) chega como clique sem detalhe.
    onClick: (e: RMouseEvent<HTMLElement>) => {
      if (e.detail === 0) onTap()
    },
    onContextMenu: (e: RMouseEvent<HTMLElement>) => e.preventDefault(),
  }
}
