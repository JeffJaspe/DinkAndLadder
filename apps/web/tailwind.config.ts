/**
 * Colors here are semantic names backed by the CSS custom properties in
 * `assets/css/tokens.css` — never literal hex. That is what makes a second
 * theme possible: an element declares intent once (`bg-surface`) and the theme
 * switch is a single class on <html>.
 *
 * `rgb(var(--x) / <alpha-value>)` is required (rather than a plain `var(--x)`)
 * so Tailwind's opacity modifiers keep working: `bg-surface/50`, `border-border/60`.
 *
 * See docs/33-DESIGN-SYSTEM-AND-THEMING-SPEC.md §3.
 */

/** Wraps a token so Tailwind can apply opacity modifiers to it. */
const token = (name: string) => `rgb(var(--dnl-${name}) / <alpha-value>)`

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './composables/**/*.ts',
    './app.vue',
    './error.vue'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          2: token('surface-2'),
          3: token('surface-3')
        },

        // Lines. `border-border` reads oddly but keeps the token name honest;
        // `border` alone is Tailwind's width utility and cannot be reused.
        border: {
          DEFAULT: token('border'),
          strong: token('border-strong')
        },

        // Text
        fg: {
          DEFAULT: token('fg'),
          secondary: token('fg-secondary'),
          muted: token('fg-muted')
        },

        // Brand
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          soft: token('primary-soft')
        },
        'on-primary': token('on-primary'),

        accent: {
          DEFAULT: token('accent'),
          soft: token('accent-soft')
        },
        'on-accent': token('on-accent'),

        // Status
        success: {
          DEFAULT: token('success'),
          soft: token('success-soft')
        },
        warning: {
          DEFAULT: token('warning'),
          fill: token('warning-fill'),
          soft: token('warning-soft')
        },
        danger: {
          DEFAULT: token('danger'),
          soft: token('danger-soft')
        },
        info: {
          DEFAULT: token('info'),
          soft: token('info-soft')
        },

        // Rating tiers — thresholds live in `utils/rating-tiers.ts`
        rating: {
          gold: token('rating-gold'),
          silver: token('rating-silver'),
          bronze: token('rating-bronze'),
          iron: token('rating-iron')
        },

        // Switch track/thumb — see the tokens.css note on why these are not
        // just surface/surface-2
        switch: {
          track: token('switch-track'),
          thumb: token('switch-thumb')
        },

        // Raised block on the canvas — see the tokens.css note on why light
        // and dark reach depth by opposite routes.
        plinth: {
          DEFAULT: token('plinth'),
          deep: token('plinth-deep'),
          top: token('plinth-top'),
          numeral: token('plinth-numeral')
        },

        // Decorative gradient stops (`from-grad-from to-grad-to`)
        'grad-from': token('grad-from'),
        'grad-to': token('grad-to')
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'stat-xl': ['4rem', { lineHeight: '1', fontWeight: '700' }],
        'stat-lg': ['3rem', { lineHeight: '1', fontWeight: '700' }],
        'stat-md': ['2rem', { lineHeight: '1.1', fontWeight: '600' }],
        'stat-sm': ['1.5rem', { lineHeight: '1.2', fontWeight: '600' }],
        // Mockup type ramp: Poppins for headings, Inter for body
        'heading-1': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'heading-2': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-3': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-1': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-2': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '400' }]
      },
      borderRadius: {
        card: '12px',
        button: '8px',
        badge: '6px',
        pill: '9999px'
      },
      boxShadow: {
        card: 'var(--dnl-shadow-card)',
        'card-hover': 'var(--dnl-shadow-card-hover)',
        // Not `plinth`: a colour named plinth already generates a .shadow-plinth
        // utility (Tailwind derives shadow-<color> from the palette), and the
        // colour rule wins, blanking the shadow. Distinct name, no collision.
        raised: 'var(--dnl-shadow-raised)',
        'glow-primary': '0 0 20px rgb(var(--dnl-primary) / 0.3)',
        'glow-accent': '0 0 20px rgb(var(--dnl-accent) / 0.3)',
        'glow-gold': '0 0 20px rgb(var(--dnl-rating-gold) / 0.4)'
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        // Mobile bottom bar sits above the iOS home indicator
        'safe-b': 'env(safe-area-inset-bottom, 0px)'
      },
      animation: {
        'rating-up': 'ratingUp 0.5s ease-out',
        'rating-down': 'ratingDown 0.5s ease-out',
        'achievement-unlock': 'achievementUnlock 0.6s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite'
      },
      keyframes: {
        ratingUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        ratingDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        achievementUnlock: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgb(var(--dnl-primary) / 0.3)' },
          '50%': { boxShadow: '0 0 30px rgb(var(--dnl-primary) / 0.5)' }
        }
      }
    }
  },
  plugins: []
}
