# Dink and Ladder: web assets

Copy the contents of this folder into your app's `public/` directory,
so `/icons/favicon.svg` is served from the site root.

## What's inside

| Folder / file        | What it is                                               |
|----------------------|----------------------------------------------------------|
| `logo/`              | Full logo with the "DINK AND LADDER" wordmark            |
| `mark/`              | DAL monogram only (for navbars and tight spaces)         |
| `icons/`             | Favicons and home-screen app icons                       |
| `social/og-image.png`| 1200×630 link-preview image for social sites and chats   |
| `site.webmanifest`   | Lets the site install as an app on phones                |

Files ending in `-dark` go on dark backgrounds (white letters).
Files ending in `-light` go on light backgrounds (charcoal letters).
Files ending in `-auto` switch between the two by following the visitor's
system dark/light setting. The logos and marks are transparent. The app
icons and the social image use a charcoal background (#1F2024), because
phones and social sites need a solid background.

## Head tags

```html
<link rel="icon" href="/icons/favicon.ico" sizes="48x48">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1F2024">

<meta property="og:image" content="https://YOUR-DOMAIN.com/social/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

## Showing the logo

Simplest: follows the visitor's system setting.

```html
<img src="/mark/dal-mark-auto.svg" alt="Dink and Ladder" height="40">
```

If your app has its own dark/light toggle, swap the file yourself instead.
The `-auto` files only follow the system setting, not your toggle.

```jsx
<img
  src={theme === 'dark' ? '/mark/dal-mark-dark.svg' : '/mark/dal-mark-light.svg'}
  alt="Dink and Ladder"
  height={40}
/>
```

PNG versions come in 1x, @2x and @3x for places that don't accept SVG,
such as emails.

## Brand colors

| Name     | Dark mode | Light mode |
|----------|-----------|------------|
| Letters  | #FFFFFF   | #1F2024    |
| Gold     | #D99B3E   | #C9862A    |
| Lime     | #D0F224   | #BEDF12    |
| Charcoal | #1F2024   | #1F2024    |

The wordmark font is Montserrat Bold with about 24% letter spacing.
