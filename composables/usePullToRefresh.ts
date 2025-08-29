// composables/usePullToRefresh.ts
export function usePullToRefresh(onRefresh: () => void, threshold = 70) {
  if (process.server) return
  let startY = 0
  let pulling = false

  const onTouchStart = (e: TouchEvent) => {
    if (window.scrollY <= 0) {
      startY = e.touches[0].clientY
      pulling = true
    }
  }
  const onTouchMove = (e: TouchEvent) => {
    if (!pulling) return
    const dy = e.touches[0].clientY - startY
    if (dy > threshold) {
      pulling = false
      onRefresh()
    }
  }
  const onTouchEnd = () => { pulling = false }

  onMounted(() => {
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
  })
}