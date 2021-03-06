import { useContext, createContext, useEffect, useState } from 'react'
import { RepoBackend } from 'hypermerge'

export const RepoContext = createContext<RepoBackend | null>(null)

export function useRepo(): RepoBackend {
  const repo = useContext(RepoContext)

  if (!repo) throw new Error('Could not find repo.')

  return repo
}

export function useWindowVisibility(): boolean {
  const [visible, setVisible] = useState(!document.hidden)

  useEffect(() => {
    function onVisibilityChange() {
      setVisible(!document.hidden)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return visible
}
