import type { RouterConfig } from '@nuxt/schema'

/**
 * Router options — scroll behavior customization.
 *
 * By default, Nuxt scrolls to top on navigation. This file explicitly
 * configures that behavior to ensure consistency and adds support for
 * hash-based navigation (e.g., #section links).
 *
 * QA finding: clicking internal links like "Get Your Rating" left the user
 * mid-page with white space above the content. This ensures the viewport
 * always starts at the top of the destination page.
 */
export default <RouterConfig>{
  scrollBehavior(to, _from, savedPosition) {
    // Restore scroll position when using browser back/forward
    if (savedPosition) {
      return savedPosition
    }

    // Scroll to hash target if present (e.g., /page#section)
    if (to.hash) {
      return {
        el: to.hash,
        behavior: 'smooth',
        top: 80 // Account for fixed header height
      }
    }

    // Default: scroll to top of page
    return { top: 0, left: 0, behavior: 'instant' }
  }
}
