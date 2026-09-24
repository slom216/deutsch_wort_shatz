# Deutsch Wortschatz transparent asset pack

Contains the full transparent dashboard plus 26 cropped PNG assets, a preview and crop coordinates.

- artwork/: hero, Word Wizard collectible card, footer staircase.
- badges/: both achievement images.
- branding/, icons/, decorations/: reusable small graphics.
- ui-reference/: button references; build actual controls as HTML/CSS.

All PNGs use RGBA. Cutouts retain generated transparency, with tight silhouette clipping on selected graphics and a 2-pixel transparent gutter. Cream areas that belong to cards and book pages are intentionally retained.

The full dashboard is an AI background-removal reference, not a production UI overlay: small text and progress bars have residual edge artifacts. Recreate interface text, rules, cards and progress bars in HTML/CSS. Crops are native-resolution raster assets, not SVGs; avoid excessive upscaling. Some fine edge differences from the original may remain.

Background removal used the built-in image editor; PNG cropping preserves its alpha. Prompt: remove beige paper and panel fills, preserve layout and colored graphics, retain intentional cream illustration details, output true transparency with clean edges.
