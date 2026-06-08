from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename):
    # Dark background #0f172a
    img = Image.new('RGB', (size, size), color='#0f172a')
    d = ImageDraw.Draw(img)
    
    # Try to load a generic font or default
    try:
        font = ImageFont.truetype("arial.ttf", int(size * 0.4))
    except IOError:
        font = ImageFont.load_default()
        
    text = "A z"
    
    # Yellow text #FFCC00
    if hasattr(d, 'textbbox'):
        bbox = d.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    else:
        text_width, text_height = d.textsize(text, font=font)
        
    x = (size - text_width) / 2
    y = (size - text_height) / 2
    
    d.text((x, y), text, fill='#FFCC00', font=font)
    
    path = os.path.join(os.getcwd(), 'public', filename)
    img.save(path)
    print(f"Saved {path}")

create_icon(192, 'icon-192.png')
create_icon(512, 'icon-512.png')
create_icon(192, 'apple-touch-icon.png')
