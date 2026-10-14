import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def draw_triangle_alert(draw, cx, cy, size, color="#DC2626"):
    # Equilateral triangle with exclamation mark
    h = size * math.sqrt(3) / 2
    p1 = (cx, cy - h / 2)
    p2 = (cx - size / 2, cy + h / 2)
    p3 = (cx + size / 2, cy + h / 2)
    draw.polygon([p1, p2, p3], fill=color)
    # White exclamation mark
    draw.line([(cx, cy - h/2 + size*0.3), (cx, cy + h/2 - size*0.35)], fill="#FFFFFF", width=3)
    draw.ellipse([(cx - 2, cy + h/2 - size*0.22), (cx + 2, cy + h/2 - size*0.14)], fill="#FFFFFF")

def draw_lightbulb(draw, cx, cy, r, color="#0284C7"):
    # Bulb circle + base
    draw.ellipse([(cx - r, cy - r), (cx + r, cy + r*0.7)], fill=color)
    draw.rectangle([(cx - r*0.5, cy + r*0.5), (cx + r*0.5, cy + r*1.1)], fill=color)
    draw.line([(cx - r*0.3, cy + r*1.2), (cx + r*0.3, cy + r*1.2)], fill=color, width=2)
    # Filament rays
    for angle in [-45, -15, 15, 45]:
        rad = math.radians(angle)
        x1 = cx + (r + 4) * math.sin(rad)
        y1 = (cy - r*0.2) - (r + 4) * math.cos(rad)
        x2 = cx + (r + 10) * math.sin(rad)
        y2 = (cy - r*0.2) - (r + 10) * math.cos(rad)
        draw.line([(x1, y1), (x2, y2)], fill=color, width=2)

def draw_star(draw, cx, cy, r, color="#059669"):
    points = []
    for i in range(10):
        angle = i * math.pi / 5 - math.pi / 2
        radius = r if i % 2 == 0 else r * 0.45
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    draw.polygon(points, fill=color)

def draw_video_camera(draw, cx, cy, w, h, color="#FFFFFF"):
    # Main camera body
    draw.rounded_rectangle([(cx - w/2, cy - h/2), (cx + w/6, cy + h/2)], radius=4, fill=color)
    # Lens triangle
    draw.polygon([
        (cx + w/6 + 2, cy - h/4),
        (cx + w/2, cy - h/2),
        (cx + w/2, cy + h/2),
        (cx + w/6 + 2, cy + h/4)
    ], fill=color)

def draw_user_avatar(draw, cx, cy, r, color="#FFFFFF"):
    # Head circle
    draw.ellipse([(cx - r*0.4, cy - r*0.7), (cx + r*0.4, cy + r*0.1)], fill=color)
    # Torso arc
    draw.chord([(cx - r*0.75, cy + r*0.05), (cx + r*0.75, cy + r*1.3)], start=0, end=180, fill=color)

def draw_calendar_icon(draw, cx, cy, size, color="#0A3C9E"):
    draw.rounded_rectangle([(cx - size/2, cy - size/2), (cx + size/2, cy + size/2)], radius=3, outline=color, width=2)
    draw.line([(cx - size/2, cy - size/6), (cx + size/2, cy - size/6)], fill=color, width=2)
    # Loops
    draw.line([(cx - size/4, cy - size/2 - 3), (cx - size/4, cy - size/2 + 2)], fill=color, width=2)
    draw.line([(cx + size/4, cy - size/2 - 3), (cx + size/4, cy - size/2 + 2)], fill=color, width=2)

def draw_pin_icon(draw, cx, cy, size, color="#0A3C9E"):
    r = size * 0.35
    draw.ellipse([(cx - r, cy - size*0.5), (cx + r, cy + size*0.2)], fill=color)
    draw.polygon([(cx - r*0.8, cy), (cx + r*0.8, cy), (cx, cy + size*0.5)], fill=color)
    draw.ellipse([(cx - r*0.35, cy - size*0.25), (cx + r*0.35, cy + size*0.05)], fill="#FFFFFF")

def draw_grad_cap(draw, cx, cy, size, color="#0A3C9E"):
    # Rhombus top
    w = size
    h = size * 0.45
    draw.polygon([(cx, cy - h), (cx + w/2, cy), (cx, cy + h), (cx - w/2, cy)], fill=color)
    # Cap skull band
    draw.polygon([(cx - w*0.35, cy + h*0.4), (cx + w*0.35, cy + h*0.4), (cx + w*0.25, cy + h*1.1), (cx - w*0.25, cy + h*1.1)], fill=color)
    # Tassel
    draw.line([(cx, cy), (cx + w*0.45, cy + h*0.5), (cx + w*0.45, cy + h*1.3)], fill=color, width=2)

def draw_map_icon(draw, cx, cy, size, color="#FFFFFF"):
    w = size
    h = size * 0.8
    p1 = (cx - w/2, cy - h/2 + 3)
    p2 = (cx - w/6, cy - h/2 - 3)
    p3 = (cx + w/6, cy - h/2 + 3)
    p4 = (cx + w/2, cy - h/2 - 3)
    
    b1 = (cx - w/2, cy + h/2 + 3)
    b2 = (cx - w/6, cy + h/2 - 3)
    b3 = (cx + w/6, cy + h/2 + 3)
    b4 = (cx + w/2, cy + h/2 - 3)
    
    draw.polygon([p1, p2, b2, b1], fill=color)
    draw.polygon([p2, p3, b3, b2], fill="#BAE6FD")
    draw.polygon([p3, p4, b4, b3], fill=color)

def draw_brain_icon(draw, cx, cy, size, color="#FFFFFF"):
    r = size * 0.4
    draw.ellipse([(cx - r*1.1, cy - r), (cx + r*1.1, cy + r*0.8)], outline=color, width=3)
    draw.line([(cx, cy - r), (cx, cy + r*0.8)], fill=color, width=2)
    draw.line([(cx - r*0.8, cy), (cx + r*0.8, cy)], fill=color, width=2)

def draw_siren_icon(draw, cx, cy, size, color="#FFFFFF"):
    r = size * 0.35
    draw.chord([(cx - r, cy - r), (cx + r, cy + r)], start=180, end=0, fill=color)
    draw.rectangle([(cx - r*1.1, cy + r*0.1), (cx + r*1.1, cy + r*0.4)], fill=color)

def draw_tent_icon(draw, cx, cy, size, color="#FFFFFF"):
    w = size * 0.8
    h = size * 0.7
    draw.polygon([(cx, cy - h/2), (cx - w/2, cy + h/2), (cx + w/2, cy + h/2)], fill=color)
    draw.polygon([(cx, cy - h/2), (cx - w*0.18, cy + h/2), (cx + w*0.18, cy + h/2)], fill="#0284C7")

def create_standee():
    # 2 ft x 4 ft at 1:2 ratio (1200 x 2400 px, 4:8 ratio)
    W, H = 1200, 2400
    standee = Image.new("RGBA", (W, H), "#FFFFFF")
    draw = ImageDraw.Draw(standee)

    # Base background gradient (subtle pale blue tint at top and bottom)
    for y in range(H):
        if y < 450:
            ratio = y / 450.0
            r = int(238 + (255 - 238) * ratio)
            g = int(247 + (255 - 247) * ratio)
            b = int(255)
        elif y > 2100:
            ratio = (y - 2100) / 300.0
            r = int(255 - (255 - 224) * ratio)
            g = int(255 - (255 - 242) * ratio)
            b = int(255 - (255 - 254) * ratio)
        else:
            r, g, b = 255, 255, 255
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    # Load System Fonts
    font_path_bold = r"C:\Windows\Fonts\segoeuib.ttf"
    font_path_reg = r"C:\Windows\Fonts\segoeui.ttf"
    font_path_arial_b = r"C:\Windows\Fonts\arialbd.ttf"

    font_univ = ImageFont.truetype(font_path_arial_b, 44)
    font_convoc = ImageFont.truetype(font_path_arial_b, 52)
    font_date_venue = ImageFont.truetype(font_path_bold, 22)
    font_ribbon_pre = ImageFont.truetype(font_path_bold, 18)
    font_ribbon_main = ImageFont.truetype(font_path_bold, 24)
    font_ribbon_sub = ImageFont.truetype(font_path_reg, 20)
    font_title = ImageFont.truetype(font_path_arial_b, 68)
    font_tagline = ImageFont.truetype(font_path_bold, 24)
    font_card_head = ImageFont.truetype(font_path_bold, 24)
    font_card_body = ImageFont.truetype(font_path_reg, 21)
    font_feature_badge = ImageFont.truetype(font_path_bold, 17)
    font_team_name = ImageFont.truetype(font_path_bold, 26)
    font_team_role = ImageFont.truetype(font_path_bold, 20)
    font_team_sub = ImageFont.truetype(font_path_reg, 18)

    sample_assets_dir = r"C:\Users\satyam pathak\.gemini\antigravity-ide\brain\fcde794c-f405-4ad2-a05b-6a3e37dc4597\sample_assets"
    qr_dir = r"C:\Users\satyam pathak\.gemini\antigravity-ide\brain\fcde794c-f405-4ad2-a05b-6a3e37dc4597\qr"
    logo_dir = r"c:\Users\satyam pathak\OneDrive\Documents\LUCKNOW\playstore\assets"

    # ==========================================
    # 1. TOP HEADER: UNIVERSITY & CONVOCATION
    # ==========================================
    # Paste Maharishi portrait medallion with smooth circular mask
    maharishi_p = os.path.join(sample_assets_dir, "maharishi_medallion.png")
    if os.path.exists(maharishi_p):
        m_img = Image.open(maharishi_p).convert("RGBA")
        m_img = m_img.resize((150, 150), Image.Resampling.LANCZOS)
        # Create circular alpha mask to remove any rectangular crop boundary
        mask_m = Image.new("L", (150, 150), 0)
        mask_m_draw = ImageDraw.Draw(mask_m)
        mask_m_draw.ellipse([(0, 0), (150, 150)], fill=255)
        standee.paste(m_img, (120, 22), mask_m)

    # Paste MUIT Round Seal with smooth circular mask
    muit_p = os.path.join(sample_assets_dir, "muit_seal.png")
    if os.path.exists(muit_p):
        mu_img = Image.open(muit_p).convert("RGBA")
        mu_img = mu_img.resize((145, 145), Image.Resampling.LANCZOS)
        mask_mu = Image.new("L", (145, 145), 0)
        mask_mu_draw = ImageDraw.Draw(mask_mu)
        mask_mu_draw.ellipse([(0, 0), (145, 145)], fill=255)
        standee.paste(mu_img, (W - 270, 25), mask_mu)

    # University Name
    draw.text((W // 2, 58), "MAHARISHI", fill="#8B1D2C", font=font_univ, anchor="mm")
    draw.text((W // 2, 112), "UNIVERSITY", fill="#8B1D2C", font=font_univ, anchor="mm")

    # Thin vertical separator line left of university title
    draw.line([(290, 36), (290, 134)], fill="#8B1D2C", width=3)

    # Convocation Bar with graduation cap icon
    draw_grad_cap(draw, 140, 192, 45, color="#0A3C9E")
    draw.text((W // 2 + 15, 192), "7TH CONVOCATION 2026", fill="#0A3C9E", font=font_convoc, anchor="mm")

    # Date and Venue line with crisp icons
    cal_x = 185
    draw_calendar_icon(draw, cal_x, 254, 20, color="#034575")
    draw.text((cal_x + 18, 254), "22ND OCTOBER 2026", fill="#034575", font=font_date_venue, anchor="lm")
    
    sep_x = 475
    draw.line([(sep_x, 242), (sep_x, 266)], fill="#94A3B8", width=2)
    
    pin_x = 515
    draw_pin_icon(draw, pin_x, 254, 20, color="#034575")
    draw.text((pin_x + 18, 254), "Venue: Maharishi University Lucknow Campus", fill="#034575", font=font_date_venue, anchor="lm")

    # ==========================================
    # 2. PRESENTED BY RIBBON
    # ==========================================
    rib_top = 295
    rib_bot = 405
    rib_h = rib_bot - rib_top
    rib_left = 60
    rib_right = W - 60
    notch = 45

    # Main Ribbon polygon
    draw.polygon([
        (rib_left, rib_top + rib_h // 2),
        (rib_left + notch, rib_top),
        (rib_right - notch, rib_top),
        (rib_right, rib_top + rib_h // 2),
        (rib_right - notch, rib_bot),
        (rib_left + notch, rib_bot)
    ], fill="#0284C7")

    # Inner highlight ribbon polygon
    draw.polygon([
        (rib_left + 6, rib_top + rib_h // 2),
        (rib_left + notch + 4, rib_top + 4),
        (rib_right - notch - 4, rib_top + 4),
        (rib_right - 6, rib_top + rib_h // 2),
        (rib_right - notch - 4, rib_bot - 4),
        (rib_left + notch + 4, rib_bot - 4)
    ], fill="#0EA5E9")

    # "PRESENTED BY" top badge
    badge_w = 210
    draw.rectangle([((W - badge_w) // 2, rib_top - 6), ((W + badge_w) // 2, rib_top + 26)], fill="#0369A1")
    draw.text((W // 2, rib_top + 10), "PRESENTED BY", fill="#FFFFFF", font=font_ribbon_pre, anchor="mm")

    # Campuses text inside ribbon
    draw.text((W // 2, rib_top + 48), "MAHARISHI SCHOOL OF ENGINEERING AND TECHNOLOGY (MSOET)", fill="#FFFFFF", font=font_ribbon_main, anchor="mm")
    draw.text((W // 2, rib_top + 78), "Maharishi University of Information Technology", fill="#FFFFFF", font=font_ribbon_sub, anchor="mm")
    draw.text((W // 2, rib_top + 102), "Noida campus", fill="#E0F2FE", font=font_ribbon_sub, anchor="mm")

    # ==========================================
    # 3. PROJECT TITLE & LOGO BAR
    # ==========================================
    proj_bar_y = 445
    app_icon_p = os.path.join(logo_dir, "app_icon_playstore_512.png")
    if os.path.exists(app_icon_p):
        a_icon = Image.open(app_icon_p).convert("RGBA")
        a_icon = a_icon.resize((120, 120), Image.Resampling.LANCZOS)
        mask = Image.new("L", (120, 120), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([(0, 0), (120, 120)], radius=24, fill=255)
        standee.paste(a_icon, (140, proj_bar_y), mask)

    draw.line([(285, proj_bar_y + 10), (285, proj_bar_y + 110)], fill="#0284C7", width=6)
    draw.text((310, proj_bar_y + 40), "AISTER", fill="#0A3C9E", font=font_title, anchor="lm")
    draw.text((585, proj_bar_y + 42), "/ RESCUE AI", fill="#0284C7", font=ImageFont.truetype(font_path_arial_b, 46), anchor="lm")

    tagline_text = "AI Disaster Rescue Coordinator   |   Emergency Triage   |   Citizen Safety"
    draw.text((W // 2, proj_bar_y + 130), tagline_text, fill="#034575", font=font_tagline, anchor="mm")

    # ==========================================
    # 4. THREE OVERVIEW CARDS
    # ==========================================
    cards_y = 620
    card_h = 360
    card_w = 346
    card_spacing = 20
    start_x = 70

    def draw_card(x, y, w, h, bg_color, border_color, radius=18):
        draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=radius, fill=bg_color, outline=border_color, width=2)

    # Card 1: THE CHALLENGE
    c1_x = start_x
    draw_card(c1_x, cards_y, card_w, card_h, "#FFF5F5", "#FCA5A5")
    # Header pill
    draw.rounded_rectangle([(c1_x + 12, cards_y + 12), (c1_x + card_w - 12, cards_y + 68)], radius=14, fill="#DC2626")
    draw.ellipse([(c1_x + 20, cards_y + 16), (c1_x + 68, cards_y + 64)], fill="#FFFFFF")
    draw_triangle_alert(draw, c1_x + 44, cards_y + 40, size=24, color="#DC2626")
    draw.text((c1_x + 82, cards_y + 40), "THE CHALLENGE", fill="#FFFFFF", font=font_card_head, anchor="lm")
    
    c1_text = [
        "When extreme disasters strike,",
        "chaotic communication and delayed",
        "emergency dispatch cost human lives.",
        "",
        "Affected citizens and rescue teams",
        "require instant, high-precision",
        "situational awareness and automated",
        "triage to prioritize critical casualties."
    ]
    cur_y = cards_y + 90
    for line in c1_text:
        draw.text((c1_x + 22, cur_y), line, fill="#1E293B", font=font_card_body)
        cur_y += 28

    # Card 2: OUR SOLUTION
    c2_x = start_x + card_w + card_spacing
    draw_card(c2_x, cards_y, card_w, card_h, "#F0F9FF", "#7DD3FC")
    draw.rounded_rectangle([(c2_x + 12, cards_y + 12), (c2_x + card_w - 12, cards_y + 68)], radius=14, fill="#0284C7")
    draw.ellipse([(c2_x + 20, cards_y + 16), (c2_x + 68, cards_y + 64)], fill="#FFFFFF")
    draw_lightbulb(draw, c2_x + 44, cards_y + 38, r=12, color="#0284C7")
    draw.text((c2_x + 82, cards_y + 40), "OUR SOLUTION", fill="#FFFFFF", font=font_card_head, anchor="lm")
    
    c2_text = [
        "AISTER provides an end-to-end",
        "emergency response platform:",
        "• 1-Click & Voice SOS Beaconing",
        "• Deterministic AI Risk Engine",
        "• Live Tactical NDRF Fleet Map",
        "• Safe Route Hazard Avoidance",
        "• Offline-First Sync & Shelters"
    ]
    cur_y = cards_y + 90
    for line in c2_text:
        draw.text((c2_x + 22, cur_y), line, fill="#1E293B", font=font_card_body)
        cur_y += 30

    # Card 3: KEY FEATURES
    c3_x = start_x + (card_w + card_spacing) * 2
    draw_card(c3_x, cards_y, card_w, card_h, "#F0FDF4", "#86EFAC")
    draw.rounded_rectangle([(c3_x + 12, cards_y + 12), (c3_x + card_w - 12, cards_y + 68)], radius=14, fill="#059669")
    draw.ellipse([(c3_x + 20, cards_y + 16), (c3_x + 68, cards_y + 64)], fill="#FFFFFF")
    draw_star(draw, c3_x + 44, cards_y + 40, r=14, color="#059669")
    draw.text((c3_x + 82, cards_y + 40), "KEY FEATURES", fill="#FFFFFF", font=font_card_head, anchor="lm")

    # 4 circular badges in 2x2 grid with custom vector icons
    # Badge 1: Live Risk Map
    b1_x, b1_y = c3_x + 85, cards_y + 155
    draw.ellipse([(b1_x - 36, b1_y - 36), (b1_x + 36, b1_y + 36)], fill="#0284C7")
    draw_map_icon(draw, b1_x, b1_y, size=32, color="#FFFFFF")
    draw.text((b1_x, b1_y + 50), "Live Risk", fill="#0F172A", font=font_feature_badge, anchor="mm")
    draw.text((b1_x, b1_y + 68), "Map", fill="#0F172A", font=font_feature_badge, anchor="mm")

    # Badge 2: AI Casualty Triage
    b2_x, b2_y = c3_x + 260, cards_y + 155
    draw.ellipse([(b2_x - 36, b2_y - 36), (b2_x + 36, b2_y + 36)], fill="#0284C7")
    draw_brain_icon(draw, b2_x, b2_y, size=32, color="#FFFFFF")
    draw.text((b2_x, b2_y + 50), "AI Casualty", fill="#0F172A", font=font_feature_badge, anchor="mm")
    draw.text((b2_x, b2_y + 68), "Triage", fill="#0F172A", font=font_feature_badge, anchor="mm")

    # Badge 3: Instant SOS Beacon
    b3_x, b3_y = c3_x + 85, cards_y + 270
    draw.ellipse([(b3_x - 36, b3_y - 36), (b3_x + 36, b3_y + 36)], fill="#0284C7")
    draw_siren_icon(draw, b3_x, b3_y, size=32, color="#FFFFFF")
    draw.text((b3_x, b3_y + 50), "Instant SOS", fill="#0F172A", font=font_feature_badge, anchor="mm")
    draw.text((b3_x, b3_y + 68), "Beacon", fill="#0F172A", font=font_feature_badge, anchor="mm")

    # Badge 4: Shelters & Safe Routes
    b4_x, b4_y = c3_x + 260, cards_y + 270
    draw.ellipse([(b4_x - 36, b4_y - 36), (b4_x + 36, b4_y + 36)], fill="#0284C7")
    draw_tent_icon(draw, b4_x, b4_y, size=32, color="#FFFFFF")
    draw.text((b4_x, b4_y + 50), "Shelters &", fill="#0F172A", font=font_feature_badge, anchor="mm")
    draw.text((b4_x, b4_y + 68), "Safe Routes", fill="#0F172A", font=font_feature_badge, anchor="mm")

    # ==========================================
    # 5. AUTHORITY DASHBOARD (MIDDLE SCREENSHOT)
    # ==========================================
    dash_y = 1010
    dash_w = W - 140
    dash_h = 440
    dash_x = 70

    draw.rounded_rectangle([(dash_x, dash_y), (dash_x + dash_w, dash_y + dash_h)], radius=18, fill="#0B0F19", outline="#0284C7", width=3)
    draw.rounded_rectangle([(dash_x, dash_y), (dash_x + dash_w, dash_y + 55)], radius=18, fill="#0F172A")
    draw.text((dash_x + 24, dash_y + 28), "AISTER Tactical Authority Dashboard   •   NDRF Command Center   •   Zone: Lucknow Metro", fill="#38BDF8", font=ImageFont.truetype(font_path_bold, 20), anchor="lm")
    draw.rectangle([(dash_x + dash_w - 140, dash_y + 15), (dash_x + dash_w - 20, dash_y + 42)], fill="#064E3B", outline="#10B981")
    draw.text((dash_x + dash_w - 80, dash_y + 28), "● LIVE MESH", fill="#34D399", font=ImageFont.truetype(font_path_bold, 14), anchor="mm")

    chip_y = dash_y + 70
    chip_w = (dash_w - 70) // 5
    chips = [
        ("MONITORED", "8 Zones", "#38BDF8"),
        ("HIGH RISK", "3 Areas", "#EF4444"),
        ("CASUALTIES", "14 Trapped", "#F97316"),
        ("NDRF SQUADS", "6 Deployed", "#10B981"),
        ("SHELTERS", "1,250 Beds", "#A855F7")
    ]
    for idx, (lbl, val, col) in enumerate(chips):
        cx = dash_x + 15 + idx * (chip_w + 10)
        draw.rounded_rectangle([(cx, chip_y), (cx + chip_w, chip_y + 60)], radius=10, fill="#1E293B", outline="#334155")
        draw.text((cx + 12, chip_y + 18), lbl, fill="#94A3B8", font=ImageFont.truetype(font_path_bold, 12))
        draw.text((cx + 12, chip_y + 42), val, fill=col, font=ImageFont.truetype(font_path_bold, 18))

    map_x = dash_x + 15
    map_y = dash_y + 145
    map_w = int(dash_w * 0.62)
    map_h = dash_h - 160
    draw.rounded_rectangle([(map_x, map_y), (map_x + map_w, map_y + map_h)], radius=12, fill="#020617", outline="#1E293B")

    center_map_x = map_x + map_w // 2
    center_map_y = map_y + map_h // 2
    for r_cir in [40, 80, 120]:
        draw.ellipse([(center_map_x - r_cir, center_map_y - r_cir), (center_map_x + r_cir, center_map_y + r_cir)], outline="#0E7490", width=1)

    for rad, col in [(65, "#7F1D1D"), (45, "#DC2626"), (25, "#F97316"), (10, "#FEF08A")]:
        draw.ellipse([(center_map_x - 70 - rad, center_map_y - 15 - rad), (center_map_x - 70 + rad, center_map_y - 15 + rad)], fill=col)
    draw.text((center_map_x - 70, center_map_y - 15), "SOS #914", fill="#000000", font=ImageFont.truetype(font_path_bold, 11), anchor="mm")

    for rad, col in [(50, "#7C2D12"), (35, "#EA580C"), (20, "#FBBF24")]:
        draw.ellipse([(center_map_x + 90 - rad, center_map_y + 30 - rad), (center_map_x + 90 + rad, center_map_y + 30 + rad)], fill=col)
    draw.text((center_map_x + 90, center_map_y + 30), "SOS #918", fill="#000000", font=ImageFont.truetype(font_path_bold, 11), anchor="mm")

    draw.line([(center_map_x - 140, center_map_y + 70), (center_map_x - 70, center_map_y - 15)], fill="#38BDF8", width=3)
    draw.ellipse([(center_map_x - 146, center_map_y + 64), (center_map_x - 134, center_map_y + 76)], fill="#38BDF8")
    draw.text((center_map_x - 140, center_map_y + 92), "NDRF Boat 04", fill="#38BDF8", font=ImageFont.truetype(font_path_bold, 12), anchor="mm")

    tel_x = map_x + map_w + 15
    tel_y = map_y
    tel_w = dash_w - map_w - 45
    tel_h = map_h
    draw.rounded_rectangle([(tel_x, tel_y), (tel_x + tel_w, tel_y + tel_h)], radius=12, fill="#1E293B", outline="#334155")
    draw.text((tel_x + 16, tel_y + 24), "TARGET CASUALTY ASSESSMENT", fill="#F8FAFC", font=ImageFont.truetype(font_path_bold, 14))

    draw.ellipse([(tel_x + 20, tel_y + 48), (tel_x + 100, tel_y + 128)], fill="#7F1D1D", outline="#EF4444", width=3)
    draw.text((tel_x + 60, tel_y + 80), "92", fill="#FFFFFF", font=ImageFont.truetype(font_path_bold, 32), anchor="mm")
    draw.text((tel_x + 60, tel_y + 106), "CRITICAL", fill="#FCA5A5", font=ImageFont.truetype(font_path_bold, 10), anchor="mm")

    draw.text((tel_x + 115, tel_y + 60), "Flash Flood Level: +2.4m", fill="#E2E8F0", font=ImageFont.truetype(font_path_bold, 12))
    draw.text((tel_x + 115, tel_y + 84), "Trapped: 6 (2 Elderly)", fill="#F87171", font=ImageFont.truetype(font_path_bold, 12))
    draw.text((tel_x + 115, tel_y + 108), "Route ETA: 7 mins", fill="#34D399", font=ImageFont.truetype(font_path_bold, 12))

    draw.line([(tel_x + 16, tel_y + 145), (tel_x + tel_w - 16, tel_y + 145)], fill="#334155", width=1)
    draw.text((tel_x + 16, tel_y + 165), "Safe Route Heuristics:", fill="#38BDF8", font=ImageFont.truetype(font_path_bold, 13))
    draw.text((tel_x + 16, tel_y + 190), "• Waterlogged Main Arterial Bypassed", fill="#CBD5E1", font=ImageFont.truetype(font_path_reg, 12))
    draw.text((tel_x + 16, tel_y + 215), "• High-Ground Relief Corridor Assigned", fill="#CBD5E1", font=ImageFont.truetype(font_path_reg, 12))
    draw.text((tel_x + 16, tel_y + 240), "• Shelter Capacity: 450 Open Beds", fill="#34D399", font=ImageFont.truetype(font_path_bold, 12))

    # ==========================================
    # 6. BOTTOM SECTION: 2 MOBILE SCREENS + QR CARD
    # ==========================================
    bot_y = 1485
    bot_h = 490

    # Mobile Mockup 1
    m1_w = 320
    m1_h = 475
    m1_x = 70
    draw.rounded_rectangle([(m1_x, bot_y), (m1_x + m1_w, bot_y + m1_h)], radius=24, fill="#0F172A", outline="#0284C7", width=3)
    draw.rectangle([(m1_x + 90, bot_y + 6), (m1_x + m1_w - 90, bot_y + 22)], fill="#020617")
    draw.text((m1_x + 20, bot_y + 38), "AISTER Citizen Portal", fill="#38BDF8", font=ImageFont.truetype(font_path_bold, 15))

    draw.rounded_rectangle([(m1_x + 15, bot_y + 60), (m1_x + m1_w - 15, bot_y + 130)], radius=12, fill="#1E293B")
    draw.text((m1_x + 28, bot_y + 78), "Heavy Rainfall Advisory", fill="#F8FAFC", font=ImageFont.truetype(font_path_bold, 13))
    draw.text((m1_x + 28, bot_y + 102), "Precipitation: 148 mm/hr | Wind: 42 km/h", fill="#94A3B8", font=ImageFont.truetype(font_path_reg, 11))

    # SOS Panic Trigger Button in Phone
    draw.ellipse([(m1_x + m1_w // 2 - 65, bot_y + 155), (m1_x + m1_w // 2 + 65, bot_y + 285)], fill="#7F1D1D")
    draw.ellipse([(m1_x + m1_w // 2 - 55, bot_y + 165), (m1_x + m1_w // 2 + 55, bot_y + 275)], fill="#DC2626")
    draw.text((m1_x + m1_w // 2, bot_y + 210), "SOS", fill="#FFFFFF", font=ImageFont.truetype(font_path_bold, 36), anchor="mm")
    draw.text((m1_x + m1_w // 2, bot_y + 240), "HOLD 3 SECONDS", fill="#FEE2E2", font=ImageFont.truetype(font_path_bold, 10), anchor="mm")

    draw.rounded_rectangle([(m1_x + 15, bot_y + 305), (m1_x + m1_w - 15, bot_y + 445)], radius=12, fill="#1E293B")
    draw.text((m1_x + 26, bot_y + 322), "Active Regional Alerts", fill="#F8FAFC", font=ImageFont.truetype(font_path_bold, 12))
    draw.text((m1_x + 26, bot_y + 348), "• Flash Flood Warning — Gomti Basin", fill="#F87171", font=ImageFont.truetype(font_path_bold, 11))
    draw.text((m1_x + 26, bot_y + 372), "• Submerged Highway 27 Closed", fill="#FBBF24", font=ImageFont.truetype(font_path_reg, 11))
    draw.text((m1_x + 26, bot_y + 396), "• Relief Camp 03: Open (Food & Bed)", fill="#34D399", font=ImageFont.truetype(font_path_reg, 11))
    draw.text((m1_x + 26, bot_y + 420), "• Voice SOS Active ('HELP', 'BACHAO')", fill="#38BDF8", font=ImageFont.truetype(font_path_reg, 11))

    # Mobile Mockup 2
    m2_w = 320
    m2_h = 475
    m2_x = m1_x + m1_w + 30
    draw.rounded_rectangle([(m2_x, bot_y), (m2_x + m2_w, bot_y + m2_h)], radius=24, fill="#0F172A", outline="#0284C7", width=3)
    draw.rectangle([(m2_x + 90, bot_y + 6), (m2_x + m2_w - 90, bot_y + 22)], fill="#020617")
    draw.text((m2_x + 20, bot_y + 38), "Report Emergency Hazard", fill="#38BDF8", font=ImageFont.truetype(font_path_bold, 15))
    draw.text((m2_x + 20, bot_y + 65), "Incident Classification: Flash Flood", fill="#94A3B8", font=ImageFont.truetype(font_path_reg, 12))

    draw.rounded_rectangle([(m2_x + 15, bot_y + 90), (m2_x + m2_w - 15, bot_y + 230)], radius=12, fill="#1E293B", outline="#334155")
    draw_video_camera(draw, m2_x + m2_w // 2, bot_y + 140, w=48, h=28, color="#38BDF8")
    draw.text((m2_x + m2_w // 2, bot_y + 185), "Photo / Video Evidence Attached", fill="#E2E8F0", font=ImageFont.truetype(font_path_bold, 12), anchor="mm")
    draw.text((m2_x + m2_w // 2, bot_y + 205), "AI Vision: Water Inundation 88% Conf.", fill="#38BDF8", font=ImageFont.truetype(font_path_reg, 11), anchor="mm")

    draw.rounded_rectangle([(m2_x + 15, bot_y + 245), (m2_x + m2_w - 15, bot_y + 295)], radius=10, fill="#1E293B")
    draw.text((m2_x + 25, bot_y + 262), "GPS: 26.8467° N, 80.9462° E", fill="#CBD5E1", font=ImageFont.truetype(font_path_bold, 12))
    draw.text((m2_x + 25, bot_y + 280), "Accuracy: ±4 meters (High-Precision)", fill="#10B981", font=ImageFont.truetype(font_path_reg, 10))

    draw.rounded_rectangle([(m2_x + 15, bot_y + 305), (m2_x + m2_w - 15, bot_y + 355)], radius=10, fill="#1E293B")
    draw.text((m2_x + 25, bot_y + 322), "Victims: 6 Trapped (Roof Level)", fill="#CBD5E1", font=ImageFont.truetype(font_path_bold, 12))
    draw.text((m2_x + 25, bot_y + 340), "Elderly / Child Assistance Flagged", fill="#F87171", font=ImageFont.truetype(font_path_reg, 10))

    draw.rounded_rectangle([(m2_x + 15, bot_y + 375), (m2_x + m2_w - 15, bot_y + 430)], radius=12, fill="#0284C7")
    draw.text((m2_x + m2_w // 2, bot_y + 402), "TRANSMIT DISPATCH BEACON →", fill="#FFFFFF", font=ImageFont.truetype(font_path_bold, 13), anchor="mm")

    # Project Video Card (Right Side)
    vid_x = m2_x + m2_w + 30
    vid_w = W - vid_x - 70
    vid_h = 475
    draw.rounded_rectangle([(vid_x, bot_y), (vid_x + vid_w, bot_y + vid_h)], radius=24, fill="#F0F9FF", outline="#0284C7", width=3)

    draw.rounded_rectangle([(vid_x + 20, bot_y + 18), (vid_x + vid_w - 20, bot_y + 78)], radius=16, fill="#0284C7")
    draw.ellipse([(vid_x + 30, bot_y + 24), (vid_x + 78, bot_y + 72)], fill="#FFFFFF")
    draw_video_camera(draw, vid_x + 54, bot_y + 48, w=28, h=18, color="#0284C7")
    draw.text((vid_x + 92, bot_y + 48), "PROJECT VIDEO", fill="#FFFFFF", font=ImageFont.truetype(font_path_bold, 24), anchor="lm")

    qr_p = os.path.join(qr_dir, "project_video_qr.png")
    if os.path.exists(qr_p):
        qr_img = Image.open(qr_p).convert("RGBA")
        qr_size = 260
        qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)
        
        q_box_x = vid_x + (vid_w - qr_size) // 2
        q_box_y = bot_y + 105
        draw.rounded_rectangle([(q_box_x - 12, q_box_y - 12), (q_box_x + qr_size + 12, q_box_y + qr_size + 12)], radius=12, fill="#FFFFFF", outline="#0284C7", width=2)
        standee.paste(qr_img, (q_box_x, q_box_y), qr_img)

        ray_color = "#0284C7"
        draw.line([(q_box_x - 30, q_box_y + 80), (q_box_x - 16, q_box_y + 85)], fill=ray_color, width=3)
        draw.line([(q_box_x - 35, q_box_y + 130), (q_box_x - 18, q_box_y + 130)], fill=ray_color, width=3)
        draw.line([(q_box_x - 30, q_box_y + 180), (q_box_x - 16, q_box_y + 175)], fill=ray_color, width=3)
        draw.line([(q_box_x + qr_size + 16, q_box_y + 85), (q_box_x + qr_size + 30, q_box_y + 80)], fill=ray_color, width=3)
        draw.line([(q_box_x + qr_size + 18, q_box_y + 130), (q_box_x + qr_size + 35, q_box_y + 130)], fill=ray_color, width=3)
        draw.line([(q_box_x + qr_size + 16, q_box_y + 175), (q_box_x + qr_size + 30, q_box_y + 180)], fill=ray_color, width=3)

    draw.text((vid_x + vid_w // 2, bot_y + 400), "Scan to Watch Video", fill="#0A3C9E", font=ImageFont.truetype(font_path_bold, 24), anchor="mm")
    draw.text((vid_x + vid_w // 2, bot_y + 438), "Live Walkthrough & Telemetry", fill="#0369A1", font=ImageFont.truetype(font_path_reg, 16), anchor="mm")

    # ==========================================
    # 7. FOOTER: TEAM ROSTER & WAVE MOTIF
    # ==========================================
    footer_y = 2020

    draw.line([(70, footer_y), (430, footer_y)], fill="#0284C7", width=3)
    draw.text((W // 2, footer_y), "TEAM AISTER ENGINEERS", fill="#0A3C9E", font=ImageFont.truetype(font_path_bold, 28), anchor="mm")
    draw.line([(770, footer_y), (W - 70, footer_y)], fill="#0284C7", width=3)

    col_width = (W - 140) // 3
    
    # Member 1: Satyam Pathak (Lead Developer)
    m1_center = 70 + col_width // 2
    draw.ellipse([(m1_center - 38, footer_y + 35), (m1_center + 38, footer_y + 111)], fill="#0284C7")
    draw_user_avatar(draw, m1_center, footer_y + 73, r=32, color="#FFFFFF")
    draw.text((m1_center, footer_y + 135), "Satyam Pathak", fill="#0A3C9E", font=font_team_name, anchor="mm")
    draw.text((m1_center, footer_y + 168), "Lead Developer & Architect", fill="#0284C7", font=font_team_role, anchor="mm")
    draw.text((m1_center, footer_y + 196), "B.Tech CSE - 3rd Year", fill="#1E293B", font=font_team_sub, anchor="mm")
    draw.text((m1_center, footer_y + 220), "Data Science", fill="#64748B", font=font_team_sub, anchor="mm")

    # Member 2: Aman Chaudhary (Full-Stack & Backend)
    m2_center = 70 + col_width + col_width // 2
    draw.line([(70 + col_width, footer_y + 40), (70 + col_width, footer_y + 230)], fill="#BAE6FD", width=2)
    draw.ellipse([(m2_center - 38, footer_y + 35), (m2_center + 38, footer_y + 111)], fill="#0284C7")
    draw_user_avatar(draw, m2_center, footer_y + 73, r=32, color="#FFFFFF")
    draw.text((m2_center, footer_y + 135), "Aman Chaudhary", fill="#0A3C9E", font=font_team_name, anchor="mm")
    draw.text((m2_center, footer_y + 168), "Full-Stack & Backend", fill="#0284C7", font=font_team_role, anchor="mm")
    draw.text((m2_center, footer_y + 196), "B.Tech CSE - 3rd Year", fill="#1E293B", font=font_team_sub, anchor="mm")
    draw.text((m2_center, footer_y + 220), "Data Science", fill="#64748B", font=font_team_sub, anchor="mm")

    # Member 3: Aryan Gupta (GIS & Mobile)
    m3_center = 70 + col_width * 2 + col_width // 2
    draw.line([(70 + col_width * 2, footer_y + 40), (70 + col_width * 2, footer_y + 230)], fill="#BAE6FD", width=2)
    draw.ellipse([(m3_center - 38, footer_y + 35), (m3_center + 38, footer_y + 111)], fill="#0284C7")
    draw_user_avatar(draw, m3_center, footer_y + 73, r=32, color="#FFFFFF")
    draw.text((m3_center, footer_y + 135), "Aryan Gupta", fill="#0A3C9E", font=font_team_name, anchor="mm")
    draw.text((m3_center, footer_y + 168), "GIS & UI Engineering", fill="#0284C7", font=font_team_role, anchor="mm")
    draw.text((m3_center, footer_y + 196), "B.Tech CSE - 3rd Year", fill="#1E293B", font=font_team_sub, anchor="mm")
    draw.text((m3_center, footer_y + 220), "Data Science", fill="#64748B", font=font_team_sub, anchor="mm")

    # Decorative Cyan / Blue Wave at bottom
    for x in range(W):
        wave_y1 = int(2340 + math.sin(x * 0.008) * 20)
        draw.line([(x, wave_y1), (x, H)], fill="#38BDF8", width=1)
        wave_y2 = int(2360 + math.sin(x * 0.007 + 1.2) * 25)
        draw.line([(x, wave_y2), (x, H)], fill="#0284C7", width=1)

    out_dir = r"C:\Users\satyam pathak\.gemini\antigravity-ide\brain\fcde794c-f405-4ad2-a05b-6a3e37dc4597\standee"
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "AISTER_Convocation_Standee_2x4ft.png")
    standee.save(out_file, "PNG", quality=100)
    print("Standee generated successfully at:", out_file)

    workspace_out = r"c:\Users\satyam pathak\OneDrive\Documents\LUCKNOW\frontend\assets\AISTER_Convocation_Standee_2x4ft.png"
    standee.save(workspace_out, "PNG", quality=100)
    print("Copied to workspace at:", workspace_out)

if __name__ == "__main__":
    create_standee()
