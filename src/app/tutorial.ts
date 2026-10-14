// "Como jogar" aparece uma vez por aparelho (a marca fica no armazenamento local do navegador).

const KEY = 'ludotrip.tutorial'

export const tutorialSeen = (): boolean => {
  try {
    return !!localStorage.getItem(KEY)
  } catch {
    return true
  }
}

export const markTutorialSeen = (): void => {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* sem armazenamento: mostra de novo na próxima */
  }
}

// A dica da trilha some depois do primeiro arraste (lembrado no aparelho); "Como jogar" a traz de volta.
const HINT = 'ludotrip.hint.trilha'

export const trilhaHintSeen = (): boolean => {
  try {
    return !!localStorage.getItem(HINT)
  } catch {
    return false
  }
}

export const markTrilhaHintSeen = (): void => {
  try {
    localStorage.setItem(HINT, '1')
  } catch {
    /* sem armazenamento */
  }
}

export const resetTrilhaHint = (): void => {
  try {
    localStorage.removeItem(HINT)
  } catch {
    /* sem armazenamento */
  }
}
