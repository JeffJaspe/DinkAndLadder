export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // DinkAndLadder Brand Colors - from design system
        background: '#0B0D09',
        surface: '#2E4540',
        primary: '#4DB175',
        accent: '#B5B9F0',

        // Extended palette
        'surface-light': '#3A5750',
        'surface-dark': '#1A2420',
        'surface-card': '#1E2E2A',
        'primary-light': '#5FC287',
        'primary-dark': '#3A9460',
        'accent-light': '#C8CBF5',
        'accent-dark': '#9498D6',

        // Semantic colors
        success: '#4DB175',
        warning: '#F5A623',
        error: '#FF6B6B',
        info: '#3B82F6',

        // Rating tiers
        'rating-gold': '#F5A623',
        'rating-silver': '#C0C0C0',
        'rating-bronze': '#CD7F32',
        'rating-iron': '#8B8B8B',

        // Text - from design system
        'text-primary': '#A6ABA7',
        'text-secondary': '#E8EBE8',
        'text-muted': '#6B7B75',
        'text-white': '#FFFFFF'
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'stat-xl': ['4rem', { lineHeight: '1', fontWeight: '700' }],
        'stat-lg': ['3rem', { lineHeight: '1', fontWeight: '700' }],
        'stat-md': ['2rem', { lineHeight: '1.1', fontWeight: '600' }],
        'stat-sm': ['1.5rem', { lineHeight: '1.2', fontWeight: '600' }],
        'heading-1': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'heading-2': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-3': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-1': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-2': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: '400' }]
      },
      borderRadius: {
        'card': '12px',
        'button': '8px',
        'badge': '6px',
        'pill': '9999px'
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 4px 16px rgba(0, 0, 0, 0.4)',
        'glow-primary': '0 0 20px rgba(77, 177, 117, 0.3)',
        'glow-accent': '0 0 20px rgba(181, 185, 240, 0.3)',
        'glow-gold': '0 0 20px rgba(245, 166, 35, 0.4)'
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem'
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
          '0%': { transform: 'translateY(10px)', opacity: '0', color: '#4DB175' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        ratingDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0', color: '#FF6B6B' },
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(77, 177, 117, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(77, 177, 117, 0.5)' }
        }
      }
    }
  },
  plugins: []
}
