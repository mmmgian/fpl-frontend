// plugins/refresh-on-focus.client.ts
export default defineNuxtPlugin(() => {
  const refreshAll = () => {
    // Revalidate all useFetch data on current page
    refreshNuxtData()
  }

  // Refresh when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAll()
  })

  // Refresh when network comes back
  window.addEventListener('online', refreshAll)

  // Optional: small idle revalidation after first paint
  // (helps when ISR HTML was a few seconds old)
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => refreshAll())
  } else {
    setTimeout(refreshAll, 0)
  }
})