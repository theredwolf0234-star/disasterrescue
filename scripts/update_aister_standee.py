import os
from PIL import Image, ImageDraw, ImageFont

def render_tactical_map(w, h):
    map_img = Image.new("RGBA", (w, h), "#020617")
    draw = ImageDraw.Draw(map_img)

    grid_size = 16
    for x in range(0, w, grid_size):
        draw.line([(x, 0), (x, h)], fill="#0F172A", width=1)
    for y in range(0, h, grid_size):
        draw.line([(0, y), (w, y)], fill="#0F172A", width=1)

    cx, cy = int(w * 0.45), int(h * 0.5)
    for r in [25, 50, 75, 100]:
        draw.ellipse([(cx - r, cy - r), (cx + r, cy + r)], outline="#0E7490", width=1)

    draw.line([(10, 20), (w - 20, h - 30)], fill="#1E293B", width=3)
    draw.line([(20, h - 20), (w - 30, 25)], fill="#1E293B", width=3)
    draw.line([(w // 2, 0), (w // 2, h)], fill="#1E293B", width=2)

    c1_x, c1_y = cx - 35, cy - 8
    for rad, col in [(42, (220, 38, 38, 60)), (28, (234, 88, 12, 120)), (16, (239, 68, 68, 200)), (8, (254, 240, 138, 255))]:
        draw.ellipse([(c1_x - rad, c1_y - rad), (c1_x + rad, c1_y + rad)], fill=col)

    draw.rounded_rectangle([(c1_x - 30, c1_y - 24), (c1_x + 30, c1_y - 10)], radius=3, fill="#DC2626")
    draw.text((c1_x, c1_y - 17), "SOS #914", fill="#FFFFFF", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 9), anchor="mm")

    c2_x, c2_y = cx + 55, cy + 18
    for rad, col in [(30, (234, 88, 12, 70)), (18, (249, 115, 22, 140)), (10, (251, 191, 36, 220))]:
        draw.ellipse([(c2_x - rad, c2_y - rad), (c2_x + rad, c2_y + rad)], fill=col)
    draw.rounded_rectangle([(c2_x - 28, c2_y - 22), (c2_x + 28, c2_y - 10)], radius=3, fill="#EA580C")
    draw.text((c2_x, c2_y - 16), "SOS #918", fill="#FFFFFF", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 9), anchor="mm")

    route_points = [(20, h - 35), (cx - 70, cy + 30), (cx - 50, cy + 10), (c1_x, c1_y)]
    draw.line(route_points, fill="#38BDF8", width=3)

    bx, by = cx - 70, cy + 30
    draw.ellipse([(bx - 6, by - 6), (bx + 6, by + 6)], fill="#38BDF8", outline="#FFFFFF", width=1)
    draw.rounded_rectangle([(bx - 32, by + 8), (bx + 32, by + 20)], radius=3, fill="#0F172A", outline="#38BDF8")
    draw.text((bx, by + 14), "NDRF Boat 04", fill="#38BDF8", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 8), anchor="mm")

    sx, sy = w - 45, 30
    draw.rounded_rectangle([(sx - 35, sy - 12), (sx + 35, sy + 6)], radius=3, fill="#065F46", outline="#10B981")
    draw.text((sx, sy - 3), "Relief Camp 03", fill="#34D399", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 8), anchor="mm")

    draw.rounded_rectangle([(8, 8), (115, 22)], radius=3, fill="#0F172A", outline="#334155")
    draw.text((12, 15), "● LIVE NDRF GIS MESH", fill="#38BDF8", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 8), anchor="lm")

    return map_img


def render_phone_1(w, h):
    phone = Image.new("RGBA", (w, h), "#0B0F19")
    draw = ImageDraw.Draw(phone)
    font_b = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 9)
    font_xs = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 7)

    draw.rounded_rectangle([(4, 4), (w - 4, 22)], radius=4, fill="#1E293B")
    draw.text((8, 13), "AISTER SOS", fill="#38BDF8", font=font_b, anchor="lm")
    draw.text((w - 8, 13), "GPS: ON", fill="#34D399", font=font_xs, anchor="rm")

    draw.rounded_rectangle([(4, 26), (w - 4, 52)], radius=4, fill="#1E293B")
    draw.text((8, 35), "Heavy Rainfall Alert", fill="#F8FAFC", font=font_b, anchor="lm")
    draw.text((8, 45), "Rain: 148 mm/h | Gomti Basin", fill="#94A3B8", font=font_xs, anchor="lm")

    cx, cy = w // 2, int(h * 0.52)
    draw.ellipse([(cx - 38, cy - 38), (cx + 38, cy + 38)], fill=(239, 68, 68, 40))
    draw.ellipse([(cx - 30, cy - 30), (cx + 30, cy + 30)], fill="#7F1D1D")
    draw.ellipse([(cx - 25, cy - 25), (cx + 25, cy + 25)], fill="#DC2626")
    draw.text((cx, cy - 4), "SOS", fill="#FFFFFF", font=ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 16), anchor="mm")
    draw.text((cx, cy + 10), "HOLD 3 SEC", fill="#FEE2E2", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 6), anchor="mm")

    draw.rounded_rectangle([(4, h - 56), (w - 4, h - 6)], radius=4, fill="#1E293B")
    draw.text((8, h - 48), "Active Emergency Status", fill="#CBD5E1", font=font_b, anchor="lm")
    draw.text((8, h - 36), "• Flood Warning: Zone 04", fill="#F87171", font=font_xs, anchor="lm")
    draw.text((8, h - 25), "• Relief Squad Approaching", fill="#34D399", font=font_xs, anchor="lm")
    draw.text((8, h - 14), "• ETA: 7 mins (Rescue Boat)", fill="#38BDF8", font=font_xs, anchor="lm")

    return phone


def render_phone_2(w, h):
    phone = Image.new("RGBA", (w, h), "#0B0F19")
    draw = ImageDraw.Draw(phone)
    font_b = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 9)
    font_xs = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 7)

    draw.rounded_rectangle([(4, 4), (w - 4, 22)], radius=4, fill="#1E293B")
    draw.text((8, 13), "Report Hazard", fill="#38BDF8", font=font_b, anchor="lm")
    draw.text((w - 8, 13), "STEP 2/3", fill="#A78BFA", font=font_xs, anchor="rm")

    draw.rounded_rectangle([(4, 26), (w - 4, 95)], radius=4, fill="#0F172A", outline="#334155")
    draw.rectangle([(6, 50), (w - 6, 93)], fill="#1E3A8A")
    draw.polygon([(15, 60), (35, 45), (55, 60)], fill="#334155")
    draw.rectangle([(20, 60), (50, 75)], fill="#475569")
    draw.rectangle([(15, 45), (w - 15, 88)], outline="#38BDF8", width=1)
    draw.rectangle([(15, 45), (w - 15, 55)], fill="#0284C7")
    draw.text((18, 50), "AI: FLOOD INUNDATION 88%", fill="#FFFFFF", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 6), anchor="lm")

    draw.rounded_rectangle([(4, 100), (w - 4, 122)], radius=4, fill="#1E293B")
    draw.text((8, 107), "GPS: 26.8467° N, 80.9462° E", fill="#E2E8F0", font=font_xs, anchor="lm")
    draw.text((8, 116), "Accuracy: ±4m (Lucknow Metro)", fill="#34D399", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 6), anchor="lm")

    draw.rounded_rectangle([(4, 126), (w - 4, 148)], radius=4, fill="#1E293B")
    draw.text((8, 133), "Victims: 6 Trapped (Roof Level)", fill="#F87171", font=font_xs, anchor="lm")
    draw.text((8, 142), "Elderly / Child Special Care Flagged", fill="#CBD5E1", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 6), anchor="lm")

    draw.rounded_rectangle([(4, h - 38), (w - 4, h - 6)], radius=6, fill="#0284C7")
    draw.text((w // 2, h - 22), "TRANSMIT BEACON →", fill="#FFFFFF", font=font_b, anchor="mm")

    return phone


def render_phone_3(w, h):
    phone = Image.new("RGBA", (w, h), "#0B0F19")
    draw = ImageDraw.Draw(phone)
    font_b = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 9)
    font_xs = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 7)

    draw.rounded_rectangle([(4, 4), (w - 4, 22)], radius=4, fill="#1E293B")
    draw.text((8, 13), "Live Tracking & Shelters", fill="#38BDF8", font=font_b, anchor="lm")
    draw.text((w - 8, 13), "LIVE", fill="#10B981", font=font_xs, anchor="rm")

    draw.rounded_rectangle([(4, 26), (w - 4, 95)], radius=4, fill="#020617", outline="#334155")
    draw.line([(15, 80), (45, 55), (85, 40), (w - 20, 60)], fill="#38BDF8", width=2)
    draw.ellipse([(w - 26, 54), (w - 14, 66)], fill="#DC2626", outline="#FFFFFF")
    draw.ellipse([(40, 50), (50, 60)], fill="#38BDF8", outline="#FFFFFF")
    draw.text((45, 68), "Squad 04", fill="#38BDF8", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 6), anchor="mm")

    draw.rounded_rectangle([(4, 100), (w - 4, 140)], radius=4, fill="#1E293B")
    draw.text((8, 108), "Assigned Relief Shelter", fill="#F8FAFC", font=font_b, anchor="lm")
    draw.text((8, 119), "Gomti Relief Camp 03", fill="#34D399", font=font_xs, anchor="lm")
    draw.text((8, 130), "Open Beds: 450 | Food & Meds", fill="#94A3B8", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 6), anchor="lm")

    draw.rounded_rectangle([(4, 144), (w - 4, h - 6)], radius=4, fill="#1E293B")
    draw.text((8, 154), "Dispatch Lifecycle Status", fill="#CBD5E1", font=font_b, anchor="lm")
    draw.text((8, 168), "✓ 1. Distress Beacon Acknowledged", fill="#34D399", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 6), anchor="lm")
    draw.text((8, 178), "✓ 2. AI Risk Assessment: Critical 92", fill="#34D399", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 6), anchor="lm")
    draw.text((8, 188), "► 3. Rescue Squad En Route (ETA 7m)", fill="#38BDF8", font=ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 6), anchor="lm")

    return phone


def update_standee():
    sample_img_path = r"C:\Users\satyam pathak\.gemini\antigravity-ide\brain\fcde794c-f405-4ad2-a05b-6a3e37dc4597\.user_uploaded\media_1791997137987.jpg"
    base_img = Image.open(sample_img_path).convert("RGBA")
    
    scale = 2
    W, H = base_img.size[0] * scale, base_img.size[1] * scale
    standee = base_img.resize((W, H), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(standee)

    font_path_bold = r"C:\Windows\Fonts\segoeuib.ttf"
    font_name = ImageFont.truetype(font_path_bold, 30)
    font_degree = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 20)
    font_spec = ImageFont.truetype(font_path_bold, 20)

    # ==========================================================
    # 1. REPLACE APP LOGO WITH NEW NEON SHIELD ICON
    # ==========================================================
    logo_path = r"C:\Users\satyam pathak\.gemini\antigravity-ide\brain\fcde794c-f405-4ad2-a05b-6a3e37dc4597\.user_uploaded\media_1791998920794.jpg"
    if not os.path.exists(logo_path):
        logo_path = r"c:\Users\satyam pathak\OneDrive\Documents\LUCKNOW\playstore\assets\app_icon_playstore_512.png"
    
    new_logo = Image.open(logo_path).convert("RGBA")
    logo_box_w = int(90 * scale)
    logo_box_h = int(90 * scale)
    logo_x = int(36 * scale)
    logo_y = int(226 * scale)
    
    new_logo_resized = new_logo.resize((logo_box_w, logo_box_h), Image.Resampling.LANCZOS)
    
    # Smooth rounded mask
    mask_logo = Image.new("L", (logo_box_w, logo_box_h), 0)
    mask_draw = ImageDraw.Draw(mask_logo)
    mask_draw.rounded_rectangle([(0, 0), (logo_box_w, logo_box_h)], radius=int(18 * scale), fill=255)
    
    standee.paste(new_logo_resized, (logo_x, logo_y), mask_logo)

    # ==========================================================
    # 2. UPDATE MAP / DASHBOARD SCREENSHOT
    # ==========================================================
    map_x = int(123 * scale)
    map_y = int(599 * scale)
    map_w = int((343 - 123) * scale)
    map_h = int((712 - 599) * scale)

    tac_map = render_tactical_map(map_w, map_h)
    standee.paste(tac_map, (map_x, map_y))
    draw.rounded_rectangle([(map_x, map_y), (map_x + map_w, map_y + map_h)], radius=int(6 * scale), outline="#0284C7", width=2)

    # ==========================================================
    # 3. UPDATE 3 PHONE SCREENS
    # ==========================================================
    p1_x = int(20 * scale)
    p1_y = int(742 * scale)
    p1_w = int((106 - 20) * scale)
    p1_h = int((880 - 742) * scale)
    p1_img = render_phone_1(p1_w, p1_h)
    standee.paste(p1_img, (p1_x, p1_y))

    p2_x = int(119 * scale)
    p2_y = int(742 * scale)
    p2_w = int((205 - 119) * scale)
    p2_h = int((880 - 742) * scale)
    p2_img = render_phone_2(p2_w, p2_h)
    standee.paste(p2_img, (p2_x, p2_y))

    p3_x = int(218 * scale)
    p3_y = int(742 * scale)
    p3_w = int((304 - 218) * scale)
    p3_h = int((880 - 742) * scale)
    p3_img = render_phone_3(p3_w, p3_h)
    standee.paste(p3_img, (p3_x, p3_y))

    # ==========================================================
    # 4. SQUARE BLANK BOX BELOW PROJECT VIDEO (FOR QR CODE)
    # ==========================================================
    vid_box_x = int(326 * scale)
    vid_box_y = int(765 * scale)
    vid_box_w = int((488 - 326) * scale)
    vid_box_h = int((850 - 765) * scale)

    draw.rounded_rectangle([(vid_box_x, vid_box_y), (vid_box_x + vid_box_w, vid_box_y + vid_box_h)], radius=int(8 * scale), fill="#F0F9FF")

    sq_size = int(76 * scale)
    sq_x = vid_box_x + (vid_box_w - sq_size) // 2
    sq_y = vid_box_y + (vid_box_h - sq_size) // 2

    draw.rectangle([(sq_x, sq_y), (sq_x + sq_size, sq_y + sq_size)], fill="#FFFFFF", outline="#0284C7", width=2)
    
    c_len = int(8 * scale)
    draw.line([(sq_x + 4, sq_y + 4), (sq_x + 4 + c_len, sq_y + 4)], fill="#38BDF8", width=2)
    draw.line([(sq_x + 4, sq_y + 4), (sq_x + 4, sq_y + 4 + c_len)], fill="#38BDF8", width=2)
    draw.line([(sq_x + sq_size - 4, sq_y + 4), (sq_x + sq_size - 4 - c_len, sq_y + 4)], fill="#38BDF8", width=2)
    draw.line([(sq_x + sq_size - 4, sq_y + 4), (sq_x + sq_size - 4, sq_y + 4 + c_len)], fill="#38BDF8", width=2)
    draw.line([(sq_x + 4, sq_y + sq_size - 4), (sq_x + 4 + c_len, sq_y + sq_size - 4)], fill="#38BDF8", width=2)
    draw.line([(sq_x + 4, sq_y + sq_size - 4), (sq_x + 4, sq_y + 4 - c_len)], fill="#38BDF8", width=2)
    draw.line([(sq_x + sq_size - 4, sq_y + sq_size - 4), (sq_x + sq_size - 4 - c_len, sq_y + sq_size - 4)], fill="#38BDF8", width=2)
    draw.line([(sq_x + sq_size - 4, sq_y + sq_size - 4), (sq_x + sq_size - 4, sq_y + 4 - c_len)], fill="#38BDF8", width=2)

    font_qr_label = ImageFont.truetype(font_path_bold, 14)
    font_qr_sub = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 11)
    draw.text((sq_x + sq_size // 2, sq_y + sq_size // 2 - 8), "PASTE QR HERE", fill="#0284C7", font=font_qr_label, anchor="mm")
    draw.text((sq_x + sq_size // 2, sq_y + sq_size // 2 + 10), "(Perfect Square)", fill="#64748B", font=font_qr_sub, anchor="mm")

    # ==========================================================
    # 5. FOOTER: ROSTER (NAMES & DEGREES ONLY, NO ROLES)
    # ==========================================================
    team_clear_y1 = int(940 * scale)
    team_clear_y2 = int(994 * scale)
    for y_c in range(team_clear_y1, team_clear_y2):
        ratio = (y_c - team_clear_y1) / float(team_clear_y2 - team_clear_y1)
        r = int(255 - (255 - 238) * ratio)
        g = int(255 - (255 - 247) * ratio)
        b = int(255)
        draw.line([(0, y_c), (W, y_c)], fill=(r, g, b, 255))

    mid_sep_x = int(256 * scale)
    draw.line([(mid_sep_x, int(920 * scale)), (mid_sep_x, int(984 * scale))], fill="#BAE6FD", width=2)

    # Member 1: Satyam Pathak
    m1_x = int(166 * scale)
    draw.text((m1_x, team_clear_y1 + 18), "Satyam Pathak", fill="#0A3C9E", font=font_name, anchor="mm")
    draw.text((m1_x, team_clear_y1 + 46), "B.Tech CSE - 2nd Year", fill="#1E293B", font=font_degree, anchor="mm")
    draw.text((m1_x, team_clear_y1 + 70), "Cyber Security", fill="#0284C7", font=font_spec, anchor="mm")

    # Member 2: Nyasa Kashish Jha
    m2_x = int(346 * scale)
    draw.text((m2_x, team_clear_y1 + 18), "Nyasa Kashish Jha", fill="#0A3C9E", font=font_name, anchor="mm")
    draw.text((m2_x, team_clear_y1 + 46), "B.Tech CSE - 2nd Year", fill="#1E293B", font=font_degree, anchor="mm")
    draw.text((m2_x, team_clear_y1 + 70), "Data Science", fill="#0284C7", font=font_spec, anchor="mm")

    out_dir = r"C:\Users\satyam pathak\.gemini\antigravity-ide\brain\fcde794c-f405-4ad2-a05b-6a3e37dc4597\standee"
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "AISTER_Convocation_Standee_Updated.png")
    standee.save(out_file, "PNG", quality=100)
    print("Updated standee saved at:", out_file)

    workspace_out = r"c:\Users\satyam pathak\OneDrive\Documents\LUCKNOW\frontend\assets\AISTER_Convocation_Standee_Updated.png"
    standee.save(workspace_out, "PNG", quality=100)
    print("Copied to workspace at:", workspace_out)

if __name__ == "__main__":
    update_standee()
