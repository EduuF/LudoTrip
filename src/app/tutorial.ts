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
