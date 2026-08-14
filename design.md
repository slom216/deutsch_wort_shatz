name | Modern Editorial
colors |
background surface surface-alt surface-elevated on-background on-surface on-surface-muted outline outline-strong primary on-primary primary-hover primary-container on-primary-container secondary on-secondary secondary-container accent success warning error
#F7F8FA #FFFFFF #F1F3F5 #FFFFFF #111318 #1A1D23 #6B7280 #E2E5E9 #C8CDD4 #5B5CE2 #FFFFFF #494AC8 #ECECFF #2F307A #111318 #FFFFFF #EEF0F3 #D97706 #16815D #B7791F #C13B3B

typography |
display-lg display-md headline-lg headline-md title-lg body-lg body-md body-sm label-lg label-md label-sm
fontFamily fontSize fontWeight lineHeight letterSpacing
Manrope 72px 700 78px -0.04em
Manrope 56px 700 62px -0.035em
Manrope 40px 650 48px -0.025em
Manrope 32px 650 40px -0.02em
Manrope 24px 650 32px -0.015em
Inter 18px 400 30px 0
Inter 16px 400 26px 0
Inter 14px 400 22px 0
Inter 14px 600 20px 0.01em
Inter 13px 600 18px 0.015em
Inter 12px 600 16px 0.025em

rounded |
xs sm DEFAULT md lg xl full
0.25rem 0.5rem 0.75rem 1rem 1.25rem 1.75rem 9999px

spacing |
unit container-padding-mobile container-padding-tablet container-padding-desktop content-gap card-gap section-gap section-gap-large
8px 20px 32px 48px 24px 20px 96px 144px

components |
page-shell content-container navbar hero-section card-standard card-elevated button-primary button-primary-hover button-secondary button-ghost input-field badge section-eyebrow feature-grid testimonial-card stat-value footer
backgroundColor textColor rounded padding maxWidth
{colors.background} {colors.on-background} 0 0 1280px
backgroundColor padding maxWidth
transparent 0 {spacing.container-padding-desktop} 1200px
backgroundColor textColor height borderColor
rgba(247,248,250,0.88) {colors.on-background} 72px {colors.outline}
backgroundColor textColor padding
transparent {colors.on-background} 112px 0 96px
backgroundColor textColor rounded padding borderColor
{colors.surface} {colors.on-surface} {rounded.lg} 28px {colors.outline}
backgroundColor textColor rounded padding borderColor shadow
{colors.surface-elevated} {colors.on-surface} {rounded.xl} 32px {colors.outline} 0 18px 50px rgba(17,19,24,0.08)
backgroundColor textColor typography rounded height padding
{colors.primary} {colors.on-primary} {typography.label-lg} {rounded.DEFAULT} 48px 0 22px
backgroundColor
{colors.primary-hover}
backgroundColor textColor typography rounded height padding borderColor
{colors.surface} {colors.on-surface} {typography.label-lg} {rounded.DEFAULT} 48px 0 22px {colors.outline-strong}
backgroundColor textColor typography rounded height padding
transparent {colors.on-surface} {typography.label-lg} {rounded.DEFAULT} 48px 0 16px
backgroundColor textColor typography rounded height padding borderColor
{colors.surface} {colors.on-surface} {typography.body-md} {rounded.DEFAULT} 48px 0 14px {colors.outline-strong}
backgroundColor textColor typography rounded padding
{colors.primary-container} {colors.on-primary-container} {typography.label-sm} {rounded.full} 6px 10px
textColor typography
{colors.on-surface-muted} {typography.label-sm}
gap columns
{spacing.card-gap} 3
backgroundColor textColor rounded padding borderColor
{colors.surface} {colors.on-surface} {rounded.lg} 28px {colors.outline}
textColor typography
{colors.on-background} {typography.display-md}
backgroundColor textColor borderColor padding
#111318 #F7F8FA rgba(255,255,255,0.12) 64px 0

## Brand & Style

This design system is intended for modern, high-trust websites that should feel premium without looking fashionable for its own sake. The visual language combines editorial restraint, strong typography, soft neutral surfaces, and one confident accent color.

The brand personality should feel intelligent, current, composed, and slightly distinctive. Interfaces should look designed rather than decorated. The system avoids excessive gradients, glassmorphism, neon effects, oversized pills, and generic AI-generated landing-page patterns.

The primary visual principle is **quiet structure with selective emphasis**. Most of the page should use neutral colors and generous negative space. Brand color should appear mainly on primary actions, links, small highlights, and selected focal elements.

## Colors

The palette uses cool neutral grays with a saturated indigo primary.

- **Background — `#F7F8FA`**: Default page background. Slightly cooler than pure white to reduce glare and create separation from cards.
- **Surface — `#FFFFFF`**: Cards, navigation surfaces, forms, and content blocks.
- **Surface Alt — `#F1F3F5`**: Alternate section backgrounds, subtle feature areas, code previews, and grouped content.
- **Primary — `#5B5CE2`**: Primary CTA, active navigation, selected states, links, and important accents.
- **Primary Hover — `#494AC8`**: Hover and pressed treatment for primary controls.
- **Primary Container — `#ECECFF`**: Soft branded backgrounds for badges, small callouts, and selected states.
- **Main Text — `#111318`**: Headlines and primary body copy.
- **Muted Text — `#6B7280`**: Supporting information and metadata.
- **Outline — `#E2E5E9`**: Default borders and dividers.

Use color economically. A typical page should be visually dominated by the background, white surfaces, dark typography, and only small areas of indigo.

Avoid full-page saturated backgrounds unless the page is intentionally campaign-oriented. Never use multiple unrelated accent colors merely to make sections look different.

Semantic colors:

- Success: `#16815D`
- Warning: `#B7791F`
- Error: `#C13B3B`

Semantic colors communicate state and should not be used decoratively.

## Typography

The system uses two font families:

- **Manrope** for display typography and headings.
- **Inter** for body text, UI controls, labels, forms, and dense information.

If external web fonts are undesirable, use:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  'Segoe UI',
  sans-serif;
```

for the entire interface rather than substituting several unrelated fonts.

### Heading treatment

Headings should be compact, confident, and slightly tightly tracked.

- Hero display: 56–72px on large screens
- Main section heading: 40px
- Secondary section heading: 32px
- Card titles: 20–24px

Large display typography should normally use `letter-spacing: -0.03em` to `-0.04em`.

Do not use bold weight everywhere. Hierarchy should also come from size, spacing, and placement.

### Body treatment

Body copy should remain highly readable:

- Standard body: 16px / 26px
- Prominent introduction: 18px / 30px
- Small supporting text: 14px / 22px

Long prose blocks should generally not exceed 680–720px in width.

## Layout & Spacing

The system follows an 8px spacing grid.

### Page width

- Maximum primary content width: `1200px`
- Maximum shell width: `1280px`
- Text-heavy content width: `680–720px`

Container padding:

- Mobile: `20px`
- Tablet: `32px`
- Desktop: `48px`

### Vertical rhythm

Standard section spacing:

- Desktop: `96px`
- Important major transitions: `128–144px`
- Mobile: `64–80px`

Avoid stacking many visually boxed sections. Prefer page rhythm created by whitespace, typography, and subtle background changes.

### Grid

Preferred desktop grids:

- 2-column editorial split for major content
- 3-column feature grid
- 4-column grid only for compact statistics, logos, or small utility cards

Collapse gracefully to one column on narrow screens.

## Elevation & Depth

Depth should be understated.

Standard surfaces use either:

```css
border: 1px solid #e2e5e9;
```

or a very subtle shadow:

```css
box-shadow: 0 8px 30px rgba(17, 19, 24, 0.06);
```

Elevated elements may use:

```css
box-shadow: 0 18px 50px rgba(17, 19, 24, 0.08);
```

Avoid large black drop shadows, colored glows, or heavy neumorphic effects.

Elevation should indicate hierarchy, not decoration.

## Shapes

The shape language is modern but restrained.

- Small controls: `8px`
- Buttons and inputs: `12px`
- Standard cards: `16px`
- Feature or hero panels: `20px`
- Large media containers: `20–24px`
- Badges: fully rounded

Do not use pill-shaped buttons for every action. Full rounding should be reserved mainly for badges, tags, avatars, segmented controls, or intentionally compact controls.

## Navigation

Navigation should be visually quiet and easy to scan.

Desktop navigation:

- 72px approximate height
- Logo aligned left
- Primary links centered or immediately after the logo
- One primary CTA aligned right
- Maximum 5–6 top-level navigation items

Use a subtle bottom border rather than a large shadow.

A sticky navigation bar may use:

```css
background: rgba(247, 248, 250, 0.88);
backdrop-filter: blur(14px);
```

Blur is acceptable here because it supports navigation legibility rather than defining the entire visual style.

## Hero

The hero must establish hierarchy immediately.

Preferred structure:

- Small eyebrow or category label
- One strong H1
- One concise supporting paragraph
- Primary CTA
- Optional secondary CTA
- Product visual, image, illustration, or proof element

Hero copy should normally occupy 5–8 words for the main message where possible.

Avoid:

- Generic gradient blobs
- Huge empty vertical space
- Multiple competing CTAs
- Decorative illustrations unrelated to the product
- Entire paragraphs inside the H1

A strong hero should communicate the product or business within a few seconds.

## Buttons

### Primary

```css
background: #5b5ce2;
color: #ffffff;
height: 48px;
padding: 0 22px;
border-radius: 12px;
font-weight: 600;
```

Hover:

```css
background: #494ac8;
transform: translateY(-1px);
```

Do not use large scale animations.

### Secondary

Secondary buttons use a white background with a visible neutral border.

```css
background: #ffffff;
border: 1px solid #c8cdd4;
color: #1a1d23;
```

### Ghost

Ghost actions should have no permanent background. Add a subtle neutral background on hover.

Every button label should communicate the action clearly.

## Cards

Cards should be used when content genuinely forms an independent unit.

Standard card:

```css
background: #ffffff;
border: 1px solid #e2e5e9;
border-radius: 16px;
padding: 28px;
```

Use shadow only when elevation communicates hierarchy.

Cards should not all contain the same icon-heading-paragraph structure. Vary composition according to content.

Do not place cards inside cards unless the nested element has a distinct functional reason.

## Forms

Inputs:

```css
height: 48px;
background: #ffffff;
border: 1px solid #c8cdd4;
border-radius: 12px;
padding: 0 14px;
font-size: 16px;
```

Focus:

```css
border-color: #5b5ce2;
box-shadow: 0 0 0 3px rgba(91, 92, 226, 0.14);
```

Forms should use visible labels. Placeholder text is supplementary and must not replace labels.

Error messages use the semantic error color and should explain how to resolve the problem.

## Images & Media

Images should be deliberate and high quality.

Preferred visual treatments:

- Product screenshots in clean framed containers
- Editorial photography with natural lighting
- Carefully art-directed illustrations
- Before/after comparisons
- Device or interface mockups used only when they clarify context

Media corners should generally use `16–24px` radius.

Avoid generic corporate stock photography and decorative AI imagery that does not communicate anything.

## Icons

Use one consistent icon family throughout the site.

Preferred characteristics:

- Outline style
- 1.75–2px stroke
- Rounded joins
- Simple geometry
- 20–24px standard size

Icons should support comprehension rather than decorate every heading.

Do not mix filled icons, emoji, line icons, and custom illustrations within the same UI hierarchy.

## Interaction & Motion

Motion should feel fast and physical.

Recommended transition:

```css
transition: 160ms ease;
```

For larger UI transitions:

```css
transition: 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
```

Good uses:

- Button hover
- Card hover when clickable
- Navigation indicators
- Accordion expansion
- Modal transitions
- Subtle reveal animations

Avoid scroll hijacking, excessive parallax, floating decorative objects, and animations that delay content.

Respect `prefers-reduced-motion`.

## Responsive Behavior

Desktop composition should not simply shrink.

On mobile:

- Hero typography reduces to approximately 40–48px
- Multi-column sections become one column
- Section spacing reduces to 64–80px
- Navigation becomes a compact menu
- Controls remain at least 44px high
- Edge-to-edge media may be used where appropriate
- Decorative content may be removed if it competes with primary information

Never allow horizontal page scrolling.

## Components

### Section Eyebrow

A small uppercase or compact semibold label above a section heading.

```css
font: 600 12px/16px Inter;
letter-spacing: 0.08em;
text-transform: uppercase;
color: #5b5ce2;
```

Use sparingly.

### Feature Grid

Use a 3-column grid at desktop widths with `20–24px` gaps.

Not every feature needs an icon. Where possible, use a screenshot, number, small diagram, or typographic treatment that reflects the actual feature.

### Testimonials

Testimonials should look editorial rather than promotional.

Use:

- Short quote
- Person's real name
- Role/company if available
- Small portrait only when authentic

Do not invent testimonials or ratings.

### Statistics

Important numbers should use Manrope at 48–56px and strong contrast.

Supporting labels remain small and muted.

Avoid presenting meaningless vanity metrics.

### Footer

Use a dark footer:

```css
background: #111318;
color: #f7f8fa;
```

Structure content with generous spacing and clear link groups.

Footer should feel like an intentional closing section rather than a dense sitemap dump.

## Content Style

Visual design and content should support each other.

Preferred copy is:

- Specific
- Brief
- Concrete
- Confident
- Free of marketing filler

Avoid phrases such as:

- "Welcome to our website"
- "Innovative solutions"
- "Empowering your journey"
- "Transform your business"
- "Next-generation experience"

unless the wording genuinely communicates something specific.

## Accessibility

Maintain WCAG-compatible contrast.

Requirements:

- Visible keyboard focus
- Semantic heading hierarchy
- Proper form labels
- Alternative text for meaningful images
- Touch targets at least 44px
- Do not rely on color alone to indicate state
- Avoid low-contrast gray-on-gray body text

Decorative animations must respect reduced-motion preferences.

## Anti-Patterns

Do not default to:

- Purple/blue gradient backgrounds on every page
- Large glowing orbs
- Glass cards everywhere
- Excessive rounded rectangles
- Every feature presented as an identical card
- Huge logos in the hero
- Fake customer logos
- Fake reviews
- Arbitrary statistics
- Oversized headings that wrap every second word
- Gratuitous 3D objects
- Auto-playing video
- Horizontal carousels for basic content
- Excessive shadows
- Excessive micro-animation

A page should feel modern because of proportion, typography, spacing, and hierarchy—not because it contains every current visual trend.

## Design Principle

When making a design decision, prioritize in this order:

1. Clarity
2. Hierarchy
3. Usability
4. Readability
5. Consistency
6. Brand character
7. Decoration

The final result should feel modern, premium, calm, and intentional.
