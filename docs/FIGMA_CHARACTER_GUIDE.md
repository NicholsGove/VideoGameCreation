# Drawing Nichols & Nibihah in Figma — Pixel Art Guide

This guide recreates the two heroes exactly as they render in-game right now:
pixel-block hair with open faces, blank (featureless) faces, slim accessories,
no capes or scarves. Nichols is the stockier green engineer; Nibihah is the
slimmer blue acrobat.

---

## 1. Figma Setup

1. Create a new Design file.
2. Press `F` and draw two frames:
   - **Nichols** — 24 × 34 px
   - **Nibihah** — 20 × 28 px
3. Zoom to ~800% (`Ctrl` + `+` or pinch).
4. Turn on the pixel grid: **View → Pixel Grid** (shows at 400%+ zoom).
5. Turn on snapping: **Preferences → Snap to Pixel Grid**.
6. Set your nudge amount to 1px: **Preferences → Nudge Amount → Small nudge: 1**.
7. Draw everything with the Rectangle tool (`R`). Every shape in this guide is
   a rectangle — no pen tool, no curves. That's what makes it pixel art.
8. Name every rectangle in the Layers panel as you go (e.g. "hair-crown",
   "belt"). Group related rects (`Ctrl+G`) into: Hair, Head, Torso, Arms,
   Legs, Boots.

**Layer order (bottom → top):** Back Arm → Legs → Boots → Torso → Belt/Sash →
Front Arm → Neck → Head → Hair → Accessories.

**Scaling up later:** select the frame, press `K` (Scale tool), and scale by a
whole multiple (8× → 192 px wide). Rectangles are vectors, so edges stay
razor sharp. Or export the frame as PNG at 8x from the Export panel.

---

## 2. Color Palettes

### Nichols (green engineer)
| Name | Hex | Used for |
|---|---|---|
| Skin | `#b4784c` | face, hands, neck |
| Skin shade | `#8d5a36` | back of head |
| Skin light | `#cf9163` | cheek highlight |
| Hair | `#2a1c14` | all hair blocks |
| Hair light | `#4a3423` | one highlight row |
| Jacket | `#3f8f52` | jacket panels |
| Jacket dark | `#28603a` | inner panel edge, back arm |
| Jacket light | `#5fb374` | outer panel edge |
| Undershirt | `#e8dcc0` | chest |
| Pants | `#2f3a4e` | legs |
| Pants dark | `#222a3a` | leg shading |
| Belt | `#6b4526` | waist belt |
| Buckle | `#8f6236` | belt center |
| Silver | `#cfd8e6` | gauntlet |
| Crystal | `#7ef7c0` | gauntlet gem (add a soft glow: Effects → Drop shadow, blur 4, color `#9bf0b8` at 80%) |
| Boot | `#40301e` | boots |
| Boot plate | `#a8b2c4` | boot top strip |

### Nibihah (blue acrobat)
| Name | Hex | Used for |
|---|---|---|
| Skin | `#b4784c` | face, hands, neck |
| Skin shade | `#8d5a36` | back of head |
| Skin light | `#cf9163` | cheek highlight |
| Hair | `#241812` | all hair + braid |
| Hair light | `#3d2a1c` | highlight row + braid pixel |
| Cloth | `#4f86c6` | tunic + legs |
| Cloth dark | `#28527c` | shading, back arm, waist taper |
| Under | `#dfe8f4` | undershirt, finger wrap |
| Armor | `#b8c2d4` | slim chest band |
| Gold | `#e8c65c` | sash, hair tie, knee guards, bracer, earring, boot strip |
| Boot | `#40301e` | boots |

---

## 3. Nichols — 24 × 34 frame

Coordinates are `(x, y, width, height)` from the frame's top-left corner.
He faces RIGHT. Draw in this order.

### Hair (all `#2a1c14` unless noted)
| Part | Rect |
|---|---|
| Spike left | (7, 2, 3, 2) |
| Spike middle (tallest) | (11, 1, 3, 3) |
| Spike right | (15, 2, 3, 2) |
| Crown slab | (6, 4, 12, 3) |
| Back of head | (6, 7, 3, 4) |
| Hairline strip (stops mid-forehead — face stays open) | (6, 7, 6, 1) |
| Highlight row — `#4a3423` | (8, 5, 6, 1) |

### Head
| Part | Rect | Color |
|---|---|---|
| Head block | (7, 7, 10, 7) | `#b4784c` |
| Back-of-head shade (left edge) | (7, 7, 2, 7) | `#8d5a36` |
| Cheek light (right side) | (14, 8, 2, 5) | `#cf9163` |
| Neck | (11, 14, 3, 1) | `#b4784c` |

**No eyes, no mouth.** The face is intentionally blank — that's the current
in-game look.

### Torso
| Part | Rect | Color |
|---|---|---|
| Undershirt | (7, 15, 10, 8) | `#e8dcc0` |
| Jacket panel left | (5, 15, 4, 10) | `#3f8f52` |
| Jacket panel right | (15, 15, 4, 10) | `#3f8f52` |
| Inner edge on left panel | (5, 15, 1, 10) | `#28603a` |
| Outer edge on right panel | (18, 15, 1, 10) | `#5fb374` |
| Belt | (5, 23, 14, 2) | `#6b4526` |
| Buckle | (11, 23, 2, 2) | `#8f6236` |

### Arms
| Part | Rect | Color |
|---|---|---|
| Back arm (behind torso) | (3, 16, 3, 7) | `#28603a` |
| Front arm — upper (skin) | (18, 16, 3, 4) | `#b4784c` |
| Gauntlet | (18, 20, 4, 4) | `#cfd8e6` |
| Crystal (add glow effect) | (19, 21, 2, 2) | `#7ef7c0` |

### Legs & Boots
| Part | Rect | Color |
|---|---|---|
| Left leg | (7, 25, 4, 5) | `#2f3a4e` |
| Left leg shade | (7, 25, 1, 5) | `#222a3a` |
| Right leg | (13, 25, 4, 5) | `#2f3a4e` |
| Right leg shade | (13, 25, 1, 5) | `#222a3a` |
| Left boot | (6, 30, 5, 4) | `#40301e` |
| Left boot plate | (6, 30, 5, 1) | `#a8b2c4` |
| Right boot | (13, 30, 5, 4) | `#40301e` |
| Right boot plate | (13, 30, 5, 1) | `#a8b2c4` |

---

## 4. Nibihah — 20 × 28 frame

She is deliberately SLIMMER than Nichols — narrower torso, thinner arms and
legs, tighter stance. She faces RIGHT.

### Hair (all `#241812` unless noted)
| Part | Rect |
|---|---|
| Top step (side part, left) | (5, 1, 4, 2) |
| Top step (right, lower) | (10, 2, 3, 1) |
| Crown slab | (4, 3, 11, 3) |
| Back fall (down to the jaw) | (4, 6, 3, 6) |
| Thin fringe (top of forehead only) | (4, 6, 5, 1) |
| Highlight row — `#3d2a1c` | (5, 4, 5, 1) |

### Braid (behind the body, hangs from the nape)
| Part | Rect | Color |
|---|---|---|
| Hair tie | (3, 11, 3, 1) | `#e8c65c` |
| Braid link 1 | (3, 12, 3, 3) | `#241812` |
| Braid link 2 (steps 1px right) | (4, 15, 3, 3) | `#241812` |
| Braid link 3 (smaller) | (5, 18, 2, 2) | `#241812` |
| Lit pixel on link 2 | (5, 16, 1, 1) | `#3d2a1c` |
| Tip binding | (5, 20, 2, 1) | `#e8c65c` |

### Head
| Part | Rect | Color |
|---|---|---|
| Head block | (5, 6, 9, 6) | `#b4784c` |
| Back shade (left edge) | (5, 6, 2, 6) | `#8d5a36` |
| Cheek light | (11, 7, 2, 4) | `#cf9163` |
| Earring | (12, 10, 1, 1) | `#e8c65c` |
| Neck | (9, 12, 2, 1) | `#b4784c` |

**Face is blank** — no eyes or mouth, same as Nichols.

### Torso (slim, with a tapered waist)
| Part | Rect | Color |
|---|---|---|
| Tunic | (5, 13, 9, 7) | `#4f86c6` |
| Waist taper left (shadow notch) | (5, 16, 1, 3) | `#28527c` |
| Waist taper right | (13, 16, 1, 3) | `#28527c` |
| Chest band (slim armor) | (6, 14, 8, 2) | `#b8c2d4` |
| Sash | (6, 19, 8, 1) | `#e8c65c` |

### Arms (thinner than Nichols')
| Part | Rect | Color |
|---|---|---|
| Back arm | (3, 14, 2, 5) | `#28527c` |
| Front arm (skin) | (14, 14, 3, 3) | `#b4784c` |
| Bracer | (14, 17, 3, 1) | `#e8c65c` |
| Finger wrap | (14, 19, 3, 1) | `#dfe8f4` |

### Legs & Boots (narrow stance)
| Part | Rect | Color |
|---|---|---|
| Left leg | (6, 20, 3, 5) | `#4f86c6` |
| Left leg shade | (6, 20, 1, 5) | `#28527c` |
| Right leg | (11, 20, 3, 5) | `#4f86c6` |
| Right leg shade | (11, 20, 1, 5) | `#28527c` |
| Left knee guard | (6, 22, 3, 1) | `#e8c65c` |
| Right knee guard | (11, 22, 3, 1) | `#e8c65c` |
| Left boot | (5, 25, 4, 3) | `#40301e` |
| Left boot strip | (5, 25, 4, 1) | `#e8c65c` |
| Right boot | (11, 25, 4, 3) | `#40301e` |
| Right boot strip | (11, 25, 4, 1) | `#e8c65c` |

---

## 5. Checking Your Work

- Zoom out to 100%. The silhouettes should read instantly: Nichols wider and
  grounded, Nibihah tall-feeling and slim despite being shorter.
- The faces must be completely open — hair never crosses below the top pixel
  row of the forehead.
- Only Nichols has the glowing crystal; only Nibihah has gold accents.
- Flip test: select all → right-click → Flip Horizontal. The game mirrors
  the sprite when they run left, so it should look right both ways.

## 6. Optional: Animation Frames

Duplicate the frame and nudge parts to match the in-game animation:
- **Idle breathing:** move torso+head+arms up 1px on alternate frames.
- **Run (4 frames):** swap leg positions (front leg back, back leg front),
  bob the whole body 1px, lean head 1px forward.
- **Jump:** both legs tucked 2px up, front arm raised 2px.
- **Wind in hair:** shift the three hair spikes (Nichols) or top steps
  (Nibihah) 1px left, keeping the crown slab still.

## 7. Exporting for the Game

The game draws characters in code, so these are for reference/marketing/mods:
select a frame → Export panel → PNG at 8x. For crisp edges at any size, also
export as SVG.
