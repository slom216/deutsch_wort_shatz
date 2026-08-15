---
version: alpha
name: Junior Achievement SoCal
description: Bright, optimistic nonprofit branding with strong teal typography, generous whitespace, and energetic lime-cyan accents.
colors:
  primary: "#285F74"
  secondary: "#00A0AF"
  tertiary: "#E6E33C"
  neutral: "#FFFFFF"
  surface: "#F6FBFC"
  on-surface: "#285F74"
  error: "#D64545"
  primary-60: "#5F8F9F"
  primary-10: "#EAF2F4"
  accent-lime: "#DCEB4A"
  accent-cyan: "#A7E8EA"
typography:
  headline-display:
    fontFamily: "Heading Font"
    fontSize: "57px"
    fontWeight: 800
    lineHeight: "68px"
    letterSpacing: "0px"
  headline-lg:
    fontFamily: "Heading Font"
    fontSize: "54px"
    fontWeight: 800
    lineHeight: "65px"
    letterSpacing: "0px"
  headline-md:
    fontFamily: "Heading Font"
    fontSize: "36px"
    fontWeight: 800
    lineHeight: "44px"
    letterSpacing: "0px"
  headline-sm:
    fontFamily: "Heading Font"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: "34px"
    letterSpacing: "0px"
  body-lg:
    fontFamily: "Body Font"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "0px"
  body-md:
    fontFamily: "Body Font"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "22.95px"
    letterSpacing: "0px"
  body-sm:
    fontFamily: "Body Font"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "0px"
  label-lg:
    fontFamily: "Body Font"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: "22px"
    letterSpacing: "0px"
  label-md:
    fontFamily: "Body Font"
    fontSize: "14.4px"
    fontWeight: 500
    lineHeight: "18px"
    letterSpacing: "0px"
  label-sm:
    fontFamily: "Body Font"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.04em"
  nav-link:
    fontFamily: "Body Font"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0px"
  button-text:
    fontFamily: "Body Font"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: "20px"
    letterSpacing: "0px"
rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  lg: "16px"
  xl: "28px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "14px"
  md: "28px"
  lg: "40px"
  xl: "88px"
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.button-text}"
    rounded: "{rounded.full}"
    padding: "14px 28px"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.button-text}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    height: "48px"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "0px"
  card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
  chip:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
# Junior Achievement SoCal

## Overview
Junior Achievement SoCal feels energetic, hopeful, and community-first, with a strong nonprofit mission tone rather than a commercial or luxury one. The visual language balances professionalism with youthful momentum through bright accent colors, bold geometry, and large hero imagery of real people in motion. Overall, the interface is spacious and optimistic, designed to inspire trust while still feeling active and approachable for students, families, educators, and donors.

## Colors
- **Primary (#285F74):** A deep teal-blue used for the brand voice, headlines, body text, navigation, and structural UI elements. It communicates trust, stability, and educational seriousness.
- **Secondary (#00A0AF):** A brighter aqua used as an energetic companion to the primary teal. It works well for emphasis, links, and supportive brand moments.
- **Tertiary (#E6E33C):** A vivid yellow-lime accent used for the main donation button and small celebratory highlights. It creates urgency and optimism without feeling harsh.
- **Neutral (#FFFFFF):** Clean white provides the primary canvas and keeps the site feeling open, modern, and accessible.
- **Surface (#F6FBFC):** A soft cool-white surface tone that can support cards, panels, and content sections without introducing heavy contrast.
- **On-surface (#285F74):** The default readable text color on light surfaces, matching the brand’s core teal identity.
- **Error (#D64545):** A restrained red reserved for validation, alerts, and destructive actions; it should remain visually secondary to the cheerful palette.
- **Primary-60 (#5F8F9F):** A lighter teal for muted text, secondary borders, or less-prominent navigation states.
- **Primary-10 (#EAF2F4):** A very pale teal tint useful for subtle backgrounds, hover fills, or informational callouts.
- **Accent-lime (#DCEB4A):** A light spring-green accent that supports gradients, illustration overlays, and joyful supporting graphics.
- **Accent-cyan (#A7E8EA):** A soft cyan accent that helps reproduce the airy, youth-focused gradient atmosphere in the hero and section backgrounds.

## Typography
The typographic system is built around two complementary families: the custom `Heading Font` for large headlines and the custom `Body Font` for everything functional and readable. Headlines are heavy, compact, and confident, using 800 weight with tight line heights to create the bold stacked hero message seen in the screenshot. Body copy is calmer and lighter, typically 500 to 700 weight, with comfortable line heights that support nonprofit storytelling and explanatory content.

Headline sizes should feel oversized and editorial, especially in hero and section introductions. Body text remains highly legible and slightly dense, giving the site enough information capacity without feeling crowded. Labels and navigation items are set in strong, compact styles; uppercase or all-caps treatment is subtle rather than aggressive, and letter spacing stays mostly neutral except for small caps-like utility labels.

## Layout
The layout uses a wide, fluid desktop canvas with generous white space and large visual anchor points. Content is arranged in clear horizontal zones: a top utility/header area, a dominant hero with left-aligned copy and right-weighted imagery, and broad content sections below. Section padding should be generous, using the spacing scale rhythm of 6px, 14px, 28px, 40px, and 88px to create small, medium, and very open vertical relationships.

The site favors expansive edge-to-edge backgrounds with occasional centered content blocks, rather than a rigid narrow column grid. Cards and content modules should maintain comfortable internal padding around 16px and feel airy when grouped into larger sections. The overall rhythm should emphasize breathing room, not density.

## Elevation & Depth
Depth is handled very lightly. The interface relies on contrast, layering, and color blocking more than on shadows or strong elevation. The extracted system shows essentially flat styling, with borders used sparingly for definition and cards relying on a 1px neutral outline rather than shadow.

Because the brand includes energetic photography, gradients, and geometric overlays, depth comes from compositing and overlap rather than from material surfaces. Buttons, cards, and chips should feel crisp and clean, with minimal shadow and clear separation through color and spacing.

## Shapes
The shape language is friendly and approachable, with rounded interactive elements and softer containers. Pill-shaped buttons and chips are prominent, especially for calls to action, giving the brand a welcoming, modern nonprofit feel. Cards use moderate rounding, while more structural elements can remain square or only lightly rounded.

Use `rounded.full` for primary actions and status chips, `rounded.sm` to `rounded.md` for fields and cards, and avoid overly ornate curves. The geometry should feel confident and simple rather than playful or bubbly.

## Components
Buttons should be highly legible and clearly differentiated by priority. `button-primary` is the main donation or conversion action: use the tertiary yellow-lime background, primary teal text, `rounded.full`, and substantial horizontal padding so it reads as an inviting pill. `button-secondary` should be quieter, with a white background, teal text, and a thin outline or implied boundary; it works for secondary actions and supporting CTAs. `button-tertiary` should behave like a text link or minimal action, with no fill and no visual weight beyond the label. Hover and focus states should preserve the brand’s clarity: slightly darken or deepen fills, but do not introduce heavy shadows.

Cards should be simple white containers with a faint border, modest corner radius, and 16px padding. They should support content modules, stat blocks, and news items without dominating the page. Inputs should stay understated, with white backgrounds, teal text, soft borders, and rounded corners; focus states should emphasize clarity through border color rather than glow. Chips use the bright tertiary accent or a softened tint, with compact padding and pill rounding to communicate categories like “Impact & Reach.”

Navigation is text-forward and lightweight. Top-level links use a strong body weight and teal color, while the donate button is the most visually dominant element in the header. Links and inline actions should feel calm and readable, with underlines or color changes used sparingly.

## Do's and Don'ts
- Do keep the interface airy, with large margins and generous section spacing.
- Do use deep teal for text and structural UI so the brand remains cohesive.
- Do reserve the bright yellow-lime accent for high-priority calls to action and celebratory highlights.
- Do keep buttons pill-shaped and clearly differentiated by emphasis.
- Do favor flat containers with light borders over heavy shadows or glass effects.
- Don't overload the page with multiple saturated accent colors at once.
- Don't use tight, cramped layouts that fight the brand’s open, optimistic feel.
- Don't introduce decorative typography or exaggerated drop shadows that would distract from the mission-driven content.